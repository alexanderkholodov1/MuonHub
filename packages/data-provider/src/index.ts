/**
 * @muonhub/data-provider
 *
 * Provider-agnostic data access layer (keystone, D4): the `DataProviderV2` interface (specs 0083
 * and 0084) with its Firebase and in-memory implementations, exported as the `v2` namespace.
 * Nothing outside this package imports a backend SDK.
 */
export * as v2 from "./v2/index.js";
