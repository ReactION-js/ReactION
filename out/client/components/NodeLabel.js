"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const NodeLabel = ({ className, nodeData }) => {
    const [divStyle, setDivStyle] = (0, react_1.useState)({
        display: "none",
        flexDirection: 'column'
    });
    const mouseEnter = () => {
        setDivStyle({
            display: "flex",
            flexDirection: 'column'
        });
    };
    const mouseOut = () => {
        setDivStyle({
            display: "none",
            flexDirection: 'column'
        });
    };
    const elArr = nodeData.attributes.map((el, index) => (react_1.default.createElement("p", { key: index }, el)));
    return (react_1.default.createElement("div", { className: className, onMouseEnter: mouseEnter, onMouseOut: mouseOut },
        react_1.default.createElement("h2", null, nodeData.name),
        react_1.default.createElement("div", { style: divStyle }, elArr)));
};
exports.default = NodeLabel;
//# sourceMappingURL=NodeLabel.js.map