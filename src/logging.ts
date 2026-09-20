// Plain function type shared by DevtoolsBridge/Puppeteer for lifecycle
// logging. Deliberately has no `vscode` import: both of those modules must
// stay usable from plain Node (see their own header comments and spike/*.js,
// which `require()` the compiled output directly with no VS Code runtime
// present), so this type can only ever describe a bare function, never
// something shaped like vscode.OutputChannel.
export type LogFn = (message: string) => void;
