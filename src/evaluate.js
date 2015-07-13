import assign from 'lodash/object/assign'
import compact from 'lodash/array/compact'
import every from 'lodash/collection/every'
import filter from 'lodash/collection/filter'
import find from 'lodash/collection/find'
import flatten from 'lodash/array/flatten'
import forEach from 'lodash/collection/forEach'
import has from 'lodash/object/has'
import includes from 'lodash/collection/includes'
import isArray from 'lodash/lang/isArray'
import isEqual from 'lodash/lang/isEqual'
import isObject from 'lodash/lang/isObject'
import keys from 'lodash/object/keys'
import map from 'lodash/collection/map'
import mapValues from 'lodash/object/mapValues'
import max from 'lodash/math/max'
import min from 'lodash/math/min'
import omit from 'lodash/object/omit'
import pluck from 'lodash/collection/pluck'
import reject from 'lodash/collection/reject'
import size from 'lodash/collection/size'
import some from 'lodash/collection/some'
import sortBy from 'lodash/collection/sortBy'
import sum from 'lodash/math/sum'
import uniq from 'lodash/array/uniq'
import isRequirementName from './isRequirementName'

export class RequiredKeyError extends Error {}
export class UnknownPropertyError extends Error {}
export class BadTypeError extends Error {}


// Helper Functions

export function compareCourse(course, to) {
    // course might have more keys than the dict we're comparing it to
    // 'to' will have some combination of:
    // - 'year'
    // - 'semester'
    // - 'department'
    // - 'number'
    // - 'level'
    // - 'international'
    // - 'lab'
    // - 'section'
    const notEqual = some(
        ['year', 'semester', 'department', 'number', 'section', 'level', 'international', 'lab'],
        key => !isEqual(course[key], to[key]))
    if (notEqual) {
        return false
    }
    return true
}


export function checkForCourse(query, courses) {
    return some(courses, (c) => compareCourse(c, query))
}


export function findCourse(query, courses) {
    return find(courses, (c) => compareCourse(c, query))
}


export function getOccurrences(course, courses) {
    return filter(courses, (c) => compareCourse(c, filter))
}


export function assertKeys(dict, ...listOfKeys) {
    const missingKeys = reject(listOfKeys, key => has(dict, key))
    if (missingKeys.length) {
        throw new RequiredKeyError(`missing ${missingKeys.join(', ')} from ${dict}`)
    }
}


export function countCourses(courses) {
    return size(uniq(pluck(courses, 'crsid')))
}


export function getDepartments(courses) {
    return uniq(flatten(pluck(courses, 'department')))
}


export function countDepartments(courses) {
    return compact(getDepartments(courses)).length
}


export function countCredits(courses) {
    return sum(pluck(courses, 'credits'))
}


export function pathToOverride(path) {
    return path.join('.').toLowerCase()
}


export function hasOverride(path, overrides) {
    return has(overrides, pathToOverride(path))
}


export function getOverride(path, overrides) {
    return overrides[pathToOverride(path)]
}


export function findOperatorType(operator) {
    if (has(operator, '$eq')) {
        return '$eq'
    }
    else if (has(operator, '$ne')) {
        return '$ne'
    }
    else if (has(operator, '$lt')) {
        return '$lt'
    }
    else if (has(operator, '$lte')) {
        return '$lte'
    }
    else if (has(operator, '$gt')) {
        return '$gt'
    }
    else if (has(operator, '$gte')) {
        return '$gte'
    }
    else {
        throw new RequiredKeyError(`no valid operators ($eq, $ne, $lt, $lte, $gt, $gte) could be found`)
    }
}


export function compareCourseAgainstOperator(course, key, operator) {
    // key: gereqs, operator: {$eq: "EIN"}
    // key: year, operator: {
    //     "$type": "operator",
    //     "$lte": {
    //       "$name": "max",
    //       "$prop": "year",
    //       "$type": "function",
    //       "$where": [{
    //         "$type": "qualification", "gereqs": {
    //           "$type": "operator", "$eq": "BTS-T"
    //         }
    //       }]
    //     }
    // } }

    const kind = findOperatorType(operator)

    if (isArray(operator[kind])) {
        throw new BadTypeError(`what would a comparison to a list even do? oh, wait; i
            suppose it could compare against one of several values... well, im
            not doing that right now. if you want it, edit the PEG and stick
            appropriate stuff in here (probably simplest to just call this
            function again with each possible value and return true if any are
            true.)`)
    }

    else if (isObject(operator[kind])) {
        // we compute the value of the function-over-where-query style operators
        // earlier, in the filterByQualification function.
        assertKeys(operator[kind], '$computed-value')
        const simplifiedOperator = {[kind]: operator[kind]['$computed-value']}
        return compareCourseAgainstOperator(course, key, simplifiedOperator)
    }

    else {
        // it's a static value; a number or string
        if (kind === '$eq') {
            return (isArray(course[key])
                    ? includes(course[key], operator[kind])
                    : course[key] === operator[kind])
        }
        else if (kind === '$ne') {
            return (isArray(course[key])
                    ? !includes(course[key], operator[kind])
                    : course[key] !== operator[kind])
        }
        else if (kind === '$lt') {
            return course[key] < operator[kind]
        }
        else if (kind === '$lte') {
            return course[key] <= operator[kind]
        }
        else if (kind === '$gt') {
            return course[key] > operator[kind]
        }
        else if (kind === '$gte') {
            return course[key] >= operator[kind]
        }
    }
}


export function filterByQualification(list, qualification, fullList) {
    // { "$type":"qualification", $key: "gereqs", $value: {"$type": "operator", "$eq": "EIN"} }
    // { "$type":"qualification", $key: "year", value: {
    //     "$type": "operator",
    //     "$lte": {
    //       "$name": "max",
    //       "$prop": "year",
    //       "$type": "function",
    //       "$where": {
    //         "$type": "qualification", $key: "gereqs", $value: {
    //           "$type": "operator", "$eq": "BTS-T"
    //         }
    //       }
    //     }
    // } }

    const operator = qualification.$value
    const kind = findOperatorType(operator)

    if (isObject(operator[kind])) {
        const value = operator[kind]
        if (value.$type === 'function') {
            let func = undefined
            if (value.$name === 'max') {
                func = max
            }
            else if (value.$name === 'min') {
                func = min
            }
            else {
                throw new RequiredKeyError(`${value.$name} is not a valid function to call.`)
            }
            const complete = fullList || list
            const filtered = filterByWhereClause(complete, value.$where)
            const items = pluck(filtered, value.$prop)
            const computed = func(items)
            // console.log('looked at', complete)
            // console.log('reduced to', filtered)
            // console.log('came up with', computed)
            value['$computed-value'] = computed
        }
        else {
            throw new BadTypeError(`${value.$type} is not a valid type for a query.`)
        }
    }

    const key = qualification.$key
    const filtered = filter(list,
        course => compareCourseAgainstOperator(course, key, operator))

    return filtered
}


export function simplifyCourse(course) {
    // because we can't expect the handy unique crsid to exist on courses from
    // area specs, we have to figure it out on our own.

    // the closest thing we can do is to reduce a course to the department +
    // number combination.

    // because we're overloading the term "course" even more than normal here.
    // in this case, it's a set of key:value props that are applied as a
    // filter to a list of fully-fledged course objects (which are actually
    // classes, but whatevs.)

    // so, if c1 looks like {dept: A, num: 1}, and c2 looks like {dept: A,
    // num: 1, year: 2015}, c2 is a more specific instance of c1.

    return `${sortBy(course.department).join('/')} ${course.number}`
}


export function filterByWhereClause(list, clause, fullList) {
    // When filtering by an and-clause, we need access to both the
    // entire list of courses, and the result of the prior iteration.
    // To simplify future invocations, we default to `fullList = list`
    if (!fullList) {
        fullList = list
    }

    // There are only two types of where-clauses: boolean, and qualification.
    // Boolean where-clauses are comprised of a set of qualifications.

    // This function always reduces down to a call to filterByQualification
    if (clause.$type === 'qualification') {
        return filterByQualification(list, clause, fullList)
    }

    // either an and- or or-clause.
    else if (clause.$type === 'boolean') {
        // and-clauses become the result of applying each invocation to the
        // result of the prior one. they are the list of unique courses which
        // meet all of the qualifications.
        if (has(clause, '$and')) {
            let filtered = list
            forEach(clause.$and, q => {
                filtered = filterByWhereClause(filtered, q, fullList)
            })
            return filtered
        }

        // or-clauses are the list of unique courses that meet one or more
        // of the qualifications.
        else if (has(clause, '$or')) {
            let filtrations = []
            forEach(clause.$or, q => {
                filtrations.push(filterByWhereClause(list, q))
            })

            // join together the list of lists of possibilities
            // then uniquify them by way of turning them into the simplified representations
            return uniq(flatten(filtrations), simplifyCourse)
        }

        // only 'and' and 'or' are currently supported.
        else {
            throw new RequiredKeyError('neither $or nor $and could be found in ${clause}')
        }
    }

    // where-clauses *must* be either a 'boolean' or a 'qualification'
    else {
        throw new BadTypeError('wth kind of type is a "${clause.$type}" clause?')
    }
}


// Collecting matches...

export function collectMatches(expr) {
    const type = expr.$type

    let matches = []
    if (type === 'requirement') {
        matches = collectMatches(expr.result)
    }
    else if (type === 'boolean') {
        matches = flatten(map(expr.$and || expr.$or || [], collectMatches))
    }
    else if (type === 'course') {
        if (expr._result === true) {
            matches = [expr]
        }
    }
    else if (type === 'modifier') {
        matches = expr._matches
    }
    else if (type === 'occurrence') {
        matches = expr._matches
    }
    else if (type === 'of') {
        matches = flatten(map(expr.$of, collectMatches))
    }
    else if (type === 'reference') {
        matches = expr._matches
    }
    else if (type === 'where') {
        matches = expr._matches
    }

    return matches
}


// Compute Functions:
// There are two types of compute functions: those that need the surrounding
// context, and those that don't.
// And, of course, the function that dispatches the appropriate compute:

export function computeChunk(expr, ctx, courses) {
    assertKeys(expr, '$type')
    const type = expr.$type

    let computed = false
    if (type === 'boolean') {
        computed = computeBoolean(expr, ctx, courses)
    }
    else if (type === 'course') {
        computed = computeCourse(expr, courses)
    }
    else if (type === 'modifier') {
        computed = computeModifier(expr, ctx, courses)
    }
    else if (type === 'occurrence') {
        computed = computeOccurrence(expr, courses)
    }
    else if (type === 'of') {
        computed = computeOf(expr, ctx, courses)
    }
    else if (type === 'reference') {
        computed = computeReference(expr, ctx)
    }
    else if (type === 'where') {
        computed = computeWhere(expr, courses)
    }

    expr._result = computed
    return computed
}


// Contained Computes:
// course, occurrence, where

export function computeCourse(expr, courses) {
    const query = omit(expr, '$type')
    if (checkForCourse(query, courses)) {
        assign(expr, findCourse(query, courses))
        return true
    }
    return false
}


export function computeOccurrence(expr, courses) {
    assertKeys(expr, '$course', '$count')
    const clause = omit(expr, ['department', 'number', 'section'])
    const filtered = getOccurrences(clause, courses)
    expr._matches = filtered
    return filtered.length >= expr.$count
}


export function computeWhere(expr, courses) {
    assertKeys(expr, '$where', '$count')
    const filtered = filterByWhereClause(courses, expr.$where)
    expr._matches = filtered
    return filtered.length >= expr.$count
}


export function applyFilter(expr, courses) {
    let filtered = []
    if (has(expr, '$where')) {
        filtered = filterByWhereClause(courses, expr.$where)
    }
    else if (has(expr, '$of')) {
        filtered = filter(expr.$of, course => some(courses, c => compareCourse(course, c)))
    }
    expr._matches = filtered
    return filtered
}


// Contextual Computes:
// boolean, modifier, of, reference

export function computeBoolean(expr, ctx, courses) {
    if (has(expr, '$or')) {
        // we only want this to use the first "true" result
        // we don't need to continue to look after we find one
        // because this is an or-clause
        const result = find(expr.$or, req => computeChunk(req, ctx, courses))
        expr._matches = collectMatches(expr)
        return Boolean(result)
    }
    else if (has(expr, '$and')) {
        const results = map(expr.$and, req => computeChunk(req, ctx, courses))
        expr._matches = collectMatches(expr)
        return every(results)
    }
    else {
        throw new RequiredKeyError(`neither $or nor $and could be found in ${expr}`)
    }
}


export function computeOf(expr, ctx, courses) {
    assertKeys(expr, '$of', '$count')

    const evaluated = map(expr.$of, req =>
        computeChunk(req, ctx, courses))

    const truthy = compact(evaluated)
    expr.$has = truthy.length
    expr._matches = collectMatches(expr)

    return expr.$has >= expr.$count
}


export function computeReference(expr, ctx) {
    assertKeys(expr, '$requirement')

    if (has(ctx, expr.$requirement)) {
        const target = ctx[expr.$requirement]
        expr._matches = target.result._matches
        return target.computed
    }

    return false
}

export function getMatchesFromChildren(expr, ctx) {
    // grab all the child requirement names for this req
    let childKeys = filter(keys(ctx), isRequirementName)

    // two options:
    if (expr.$children === '$all') {
        // use all of the child requirements in the computation
        childKeys = childKeys
    }
    else if (isArray(expr.$children)) {
        // or just use some of them (listed in expr.$children)
        const requested = pluck(expr.$children, '$requirement')
        childKeys = filter(childKeys, key => includes(requested, key))
    }

    // collect the matching courses from the requested children
    // TODO: uniq here suffers from the same problem that the dirty course stuff is
    //       struggling with. (that is, uniq works on a per-object basis, and while
    //       you can write down the same course for several reqs, they'll be different
    //       objects.)
    const matches = uniq(flatten(map(childKeys, key => collectMatches(ctx[key]))))

    return matches
}

export function getMatchesFromFilter(ctx) {
    assertKeys(ctx, 'filter')
    return ctx.filter._matches
}


export function computeModifier(expr, ctx, courses) {
    assertKeys(expr, '$what', '$count', '$from')
    const what = expr.$what

    if (!includes(['course', 'department', 'credit'], what)) {
        throw new UnknownPropertyError(what)
    }

    let filtered = []

    if (expr.$from === 'children') {
        filtered = getMatchesFromChildren(expr, ctx)
    }

    else if (expr.$from === 'filter') {
        filtered = getMatchesFromFilter(ctx)
    }

    else if (expr.$from === 'where') {
        assertKeys(expr, '$where')
        filtered = filterByWhereClause(courses, expr.$where)
    }

    expr._matches = filtered

    let num = undefined
    if (what === 'course') {
        num = countCourses(filtered)
    }
    else if (what === 'department') {
        num = countDepartments(filtered)
    }
    else if (what === 'credit') {
        num = countCredits(filtered)
    }

    expr._counted = num
    return num >= expr.$count
}



// The overall computation is done by compute, which is in charge of computing
// sub-requirements and such.

export function compute(requirement, path, courses=[], overrides={}) {
    requirement = mapValues(requirement, (req, name) => {
        return isRequirementName(name)
            ? compute(req, path.concat([name]), courses, overrides)
            : req
    })

    let computed = false

    // Apply a filter to the set of courses
    if (has(requirement, 'filter')) {
        courses = applyFilter(requirement.filter, courses)
    }

    // Now check for results
    if (has(requirement, 'result')) {
        computed = computeChunk(requirement.result, requirement, courses)
    }

    // or ask for an override
    else if (has(requirement, 'message')) {
        // show a button to toggle overriding
        computed = false
    }

    // or throw an error
    else {
        throw new RequiredKeyError('either message or result is required')
    }

    requirement.computed = computed

    if (hasOverride(path, overrides)) {
        requirement.overridden = true
        requirement.computed = getOverride(path, overrides)
    }

    return requirement
}


export default function evaluate(student, area) {
    assertKeys(area, 'name', 'result', 'type', 'revision')
    const {courses, overrides} = student
    const {name, type} = area
    return compute(area, [type, name], courses, overrides)
}
