/**
 * The published version of this package (= `version` in its package.json; a test keeps them
 * equal, so bump both together). Clients send it in `hello`: the server lets only the same
 * major.minor play together, since patches never change what `step()` computes.
 */
export const CORE_VERSION = '0.21.0';
