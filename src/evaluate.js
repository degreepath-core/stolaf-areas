import all from 'lodash/collection/all'
import any from 'lodash/collection/any'
import compact from 'lodash/array/compact'
import filter from 'lodash/collection/filter'
import flatten from 'lodash/array/flatten'
import forEach from 'lodash/collection/forEach'
import identity from 'lodash/utility/identity'
import includes from 'lodash/collection/includes'
import isArray from 'lodash/lang/isArray'
import isObject from 'lodash/lang/isObject'
import isEqual from 'lodash/lang/isEqual'
import map from 'lodash/collection/map'
import mapValues from 'lodash/object/mapValues'
import max from 'lodash/math/max'
import min from 'lodash/math/min'
import pluck from 'lodash/collection/pluck'
import reject from 'lodash/collection/reject'
import size from 'lodash/collection/size'
import sum from 'lodash/math/sum'
import union from 'lodash/array/union'
import uniq from 'lodash/array/uniq'

// - [ ] support "x from children" modifier
// - [ ] write tests


export class RequiredKeyError extends Error {}
export class UnknownPropertyError extends Error {}
export class BadTypeError extends Error {}


// Helper Functions

export function isRequirement(name) {
    return /^[A-Z]|[0-9][A-Z\- ]/.test(name)
}


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
    const notEqual = any(
        ['year', 'semester', 'department', 'number', 'section', 'level', 'international', 'lab'],
        key => !isEqual(course[key], to[key]))
    if (notEqual) {
        return false
    }
    return true
}


export function checkForCourse(course, courses) {
    return any(courses, (c) => compareCourse(c, course))
}


export function getOccurrences(course, courses) {
    return filter(courses, (c) => compareCourse(c, filter))
}


export function assertKeys(dict, ...keys): void {
    const missingKeys = reject(keys, key => includes(Object.keys(dict), key))
    if (missingKeys.length) {
        throw new RequiredKeyError(`missing ${missingKeys.join(', ')} from ${dict}`)
    }
}


export function countCourses(courses) {
    // courses::pluck('crsid')::uniq()::len()
    return size(uniq(pluck(courses, 'crsid')))
}


export function getDepartments(courses) {
    return uniq(flatten(pluck(courses, 'department')))
}


export function countDepartments(courses) {
    // courses::pluck('departments')::sum()
    return compact(getDepartments(courses)).length
}


export function countCredits(courses) {
    return sum(pluck(courses, 'credits'))
}


export function pathToOverride(path) {
    return path.join('.').toLowerCase()
}


export function hasOverride(path, overrides) {
    return pathToOverride(path) in overrides
}


export function getOverride(path, overrides) {
    return overrides[pathToOverride(path)]
}


export function findOperatorType(operator) {
    if ('$eq' in operator) {
        return '$eq'
    }
    else if ('$ne' in operator) {
        return '$ne'
    }
    else if ('$lt' in operator) {
        return '$lt'
    }
    else if ('$lte' in operator) {
        return '$lte'
    }
    else if ('$gt' in operator) {
        return '$gt'
    }
    else if ('$gte' in operator) {
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
        throw new BadTypeError({
            msg: `what would a comparison to a list even do? oh, wait; i
            suppose it could compare against one of several values... well, im
            not doing that right now. if you want it, edit the PEG and stick
            appropriate stuff in here (probably simplest to just call this
            function again with each possible value and return true if any are
            true.)`,
        })
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
        if (kind === '$eq' || kind === '$ne') {
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


export function filterByQualification(list, qualification) {
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

    if (typeof operator[kind] === 'object') {
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
            const filtered = filterByWhereClause(list, value.$where)
            const items = pluck(value.$prop, filtered)
            const computed = func(items)
            value['$computed-value'] = computed
        }
    }

    const key = qualification.$key
    const filtered = filter(list,
        course => compareCourseAgainstOperator(course, key, operator))

    return filtered
}


export function filterByWhereClause(list, clause) {
    // {gereqs = EIN & year <= max(year) from {gereqs = BTS-T}}
    // {
    //    "$type": "boolean",
    //    "$and": [
    //      { "$type":"qualification", $key: "gereqs", $value: {"$type": "operator", "$eq": "EIN"} },
    //      { "$type":"qualification", $key: "year", $value: {
    //          "$type": "operator",
    //          "$lte": {
    //            "$name": "max",
    //            "$prop": "year",
    //            "$type": "function",
    //            "$where": {
    //              "$type": "qualification", $key: "gereqs", $value: {
    //                "$type": "operator", "$eq": "BTS-T"
    //              }
    //            }
    //          }
    //      } }
    //    ]
    //  }

    if (clause.$type === 'qualification') {
        return filterByQualification(list, clause)
    }

    else if (clause.$type === 'boolean') {
        if ('$and' in clause) {
            let filtered = list
            forEach(clause.$and, q => {
                filtered = filterByWhereClause(filtered, q)
            })
            return filtered
        }

        else if ('$or' in clause) {
            let filtrations = []
            forEach(clause.$or, q => {
                filtrations = union(filtrations, filterByWhereClause(list, q))
            })
            return uniq(filtrations, 'crsid')
        }

        else {
            throw new RequiredKeyError('neither $or nor $and could be found in ${clause}')
        }
    }

    else {
        console.log(clause)
        throw new BadTypeError('wth kind of type is a "${clause.$type}" clause?')
    }
}


// Compute Functions:
// There are two types of compute functions: those that need the surrounding
// context, and those that don't.
// And, of course, the function that dispatches the appropriate compute:

export function computeChunk(expr, ctx, courses) {
    // console.log()
    // console.log('expression:', expr)
    // console.log('context:', ctx)

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
    const query = expr
    delete query.$type
    return checkForCourse(query, courses)
}


export function computeOccurrence(expr, courses) {
    assertKeys(expr, '$course', '$count')
    const clause = expr
    delete clause.department
    delete clause.number
    delete clause.section
    const filtered = getOccurrences(clause, courses)
    return filtered.length >= expr.$count
}


export function computeWhere(expr, courses) {
    assertKeys(expr, '$where', '$count')
    const filtered = filterByWhereClause(courses, expr.$where)
    expr._matches = filtered
    return filtered.length >= expr.$count
}


// Contextual Computes:
// boolean, modifier, of, reference

export function computeBoolean(expr, ctx, courses) {
    if ('$or' in expr) {
        return any(map(expr.$or, req => computeChunk(req, ctx, courses)))
    }
    else if ('$and' in expr) {
        return all(map(expr.$and, req => computeChunk(req, ctx, courses)))
    }
    else if ('$not' in expr) {
        return !(computeChunk(expr.$not, ctx, courses))
    }
    else {
        throw new RequiredKeyError(`none of $or, $and, or $not could be found in ${expr}`)
    }
}


export function computeOf(expr, ctx, courses) {
    assertKeys(expr, '$of', '$count')

    const evaluated = map(expr.$of, req =>
        computeChunk(req, ctx, courses))

    const truthy = filter(evaluated, identity)
    expr.$has = truthy.length

    return expr.$has >= expr.$count
}


export function computeReference(expr, ctx) {
    assertKeys(expr, '$requirement')
    if (expr.$requirement in ctx ){
        const target = ctx[expr.$requirement]
        return target.computed
    }
    else {
        return false
    }
}


export function computeModifier(expr, ctx, courses) {
    assertKeys(expr, '$what', '$count', '$from')
    const what = expr.$what

    if (!includes(['course', 'department', 'credit'], what)) {
        throw new UnknownPropertyError(what)
    }

    if (expr.$from === 'children') {
        console.error('not yet implemented')
        return false
    }

    else if (expr.$from === 'where') {
        assertKeys(expr, '$where', '$count')
        const filtered = filterByWhereClause(courses, expr.$where)
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

        return num >= expr.$count
    }
}



// The overall computation is done by compute, which is in charge of computing
// sub-requirements and such.

export function compute(requirement, path, courses=[], overrides={}) {
    requirement = mapValues(requirement, (req, name) => {
        return isRequirement(name)
            ? compute(req, path.concat([name]), courses, overrides)
            : req
    })

    let computed = false

    if ('result' in requirement) {
        computed = computeChunk(requirement.result, requirement, courses)
    }

    else if ('message' in requirement) {
        computed = false
        // show a button to toggle overriding
    }

    else {
        // throw new RequiredKeyError(msg='one of message or result === required')
        console.log('one of message or result === required')
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
