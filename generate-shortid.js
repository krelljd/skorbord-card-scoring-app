#!/usr/bin/env node
import { generateShortId } from './api/utils/helpers.js';

const shortId = generateShortId(4);
console.log(shortId);


