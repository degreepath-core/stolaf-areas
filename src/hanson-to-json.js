#!/usr/bin/env node

import 'babel/polyfill'

import yaml from 'js-yaml'
import fs from 'graceful-fs'
import {parse} from '../lib/parse-hanson-string'
import mapValues from 'lodash/object/mapValues'
import forEach from 'lodash/collection/forEach'
import keys from 'lodash/object/keys'
import includes from 'lodash/collection/includes'
import humanizeList from 'humanize-list'

function isReqName(name) {
    return /^([A-Z]|[0-9][A-Z0-9\- ])/.test(name)
}

function loadFile(filename) {
    const data = fs.readFileSync(filename, 'utf-8')
    const object = yaml.safeLoad(data)
    return object
}

function writeFile(filename, data) {
    fs.writeFileSync(filename, data)
}

let declaredVariables = {}

export function enhanceFile(data, {topLevel=false}={}) {
    // 1. adds 'result' key, if missing
    // 2. parses the 'result' and 'filter' keys
    // 3. warns if it encounters any lowercase keys not in the whitelist

    const baseWhitelist = ['result', 'message', 'declare']
    const topLevelWhitelist = baseWhitelist.concat(['name', 'revision', 'type'])
    const lowerLevelWhitelist = baseWhitelist.concat(['filter', 'message', 'description'])
    const whitelist = topLevel ? topLevelWhitelist : lowerLevelWhitelist

    keys(data).forEach(key => {
        if (!isReqName(key) && !whitelist.includes(key)) {
            console.warn(`only ${humanizeList(whitelist)} keys are allowed, and '${key}' is not one of them. all requirements must begin with an uppercase letter or a number.`)
        }
    })

    if ('declare' in data) {
        forEach(data.declare, (value, key) => {
            declaredVariables[key] = value
        })
    }

    const mutated = mapValues(data, (value, key) => {
        if (typeof value === 'string' && isReqName(key)) {
            value = {result: value}
        }

        if (isReqName(key)) {
            value = enhanceFile(value, {topLevel: false})
            value.$type = 'requirement'
        }

        else if (key === 'result' || key === 'filter') {
            forEach(declaredVariables, (contents, name) => {
                if (includes(value, '$' + name)) {
                    console.log(`replacing ${'$' + name} with ${contents}`)
                    // const rex = new RegExp(, 'g')
                    value = value.split(`$${name}`).join(contents)
                }
            })

            try {
                value = parse(value)
            }
            catch (e) {
                console.error(e.message)
                console.error(`(in '${value}')`)
            }
        }

        return value
    })

    if ('declare' in data) {
        forEach(data.declare, (value, key) => {
            delete declaredVariables[key]
        })
    }

    return mutated
}

function main() {
    const filename = process.argv[2]
    const outfile = process.argv[3] || filename.replace(/.yaml$/, '.json')
    if (!filename) {
        console.log(`usage: ${process.argv[1].split('/').slice(-1)} infile [outfile]`)
        return
    }
    const data = loadFile(filename)
    const mutated = enhanceFile(data, {topLevel: true})
    writeFile(outfile, JSON.stringify(mutated, null, 2))
}

main()
