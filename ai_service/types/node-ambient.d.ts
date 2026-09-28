// Lightweight ambient shims for Node module specifiers used in the project.
// These provide `any`-typed fallbacks so editors without @types/node won't error.
declare module "node:readline" {
  const anything: any;
  export = anything;
}

declare module "node:http" {
  const anything: any;
  export = anything;
}

declare module "node:process" {
  const anything: any;
  export = anything;
}

declare var process: any;

export {};
