import { Buffer } from 'buffer'
import process from 'process'

// Ensure Buffer is globally available before any other imports
globalThis.Buffer = Buffer
globalThis.process = process
window.Buffer = Buffer
window.process = process
