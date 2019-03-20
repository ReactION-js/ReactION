/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";function getAppDataPath(t){switch(t){case"win32":return process.env.VSCODE_APPDATA||process.env.APPDATA||path.join(process.env.USERPROFILE,"AppData","Roaming");case"darwin":return process.env.VSCODE_APPDATA||path.join(os.homedir(),"Library","Application Support");case"linux":return process.env.VSCODE_APPDATA||process.env.XDG_CONFIG_HOME||path.join(os.homedir(),".config");default:throw new Error("Platform not supported")}}function getDefaultUserDataPath(t){return path.join(getAppDataPath(t),pkg.name)}const pkg=require("../package.json"),path=require("path"),os=require("os");exports.getAppDataPath=getAppDataPath,exports.getDefaultUserDataPath=getDefaultUserDataPath;
//# sourceMappingURL=https://ticino.blob.core.windows.net/sourcemaps/a3db5be9b5c6ba46bb7555ec5d60178ecc2eaae4/core/paths.js.map
