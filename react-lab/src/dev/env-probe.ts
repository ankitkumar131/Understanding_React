// Prints what the bundle actually contains for a given mode (run with tsx, not Vite).
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const code = readFileSync(file, 'utf8');
const find = (needle: string): string => (code.includes(needle) ? 'found' : 'NOT found');

console.log(`--- ${file} ---`);
console.log('dev API URL inlined:       ', find('http://localhost:3001/api'));
console.log('prod API URL inlined:      ', find('https://api.react-lab.example/api'));
console.log('secret leaked into bundle: ', find('super-secret-do-not-ship'));
console.log('import.meta.env remains:   ', find('import.meta.env'));
