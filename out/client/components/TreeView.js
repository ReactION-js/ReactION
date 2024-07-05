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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const react_d3_tree_1 = __importDefault(require("react-d3-tree"));
const NodeLabel_1 = __importDefault(require("./NodeLabel"));
const styled_components_1 = __importDefault(require("styled-components"));
const TreeStyled = styled_components_1.default.div `
  .linkBase {
    fill: none;
    stroke: #d3d3d3;
    stroke-width: 2px;
  }
  font-family: 'Crimson Text', serif;
`;
const Name = styled_components_1.default.g `
  .nodenamebase {
    stroke: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
    font-size: large;
    fill: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
  }
  .nodeAttributesBase {
    stroke: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
  }
`;
const myTreeData = window._TREE_DATA;
const D3TreeChart = () => {
    const [orientation, setOrientation] = (0, react_1.useState)('vertical');
    const [x, setX] = (0, react_1.useState)(200);
    const [y, setY] = (0, react_1.useState)(100);
    const [nodeSvgShape, setNodeSvgShape] = (0, react_1.useState)({
        shape: 'circle',
        shapeProps: {
            r: 10,
            fill: '#1e1e1e',
            stroke: '#181818',
            strokeWidth: '0px',
            nodenamebase: '#1e1e1e',
        },
        theme: 'light',
        background: 'rgb(255,255,255)',
    });
    const changeOrientation = (0, react_1.useCallback)(() => {
        if (orientation === 'vertical') {
            setOrientation('horizontal');
            setX(100);
            setY(100);
        }
        else {
            setOrientation('vertical');
            setX(200);
            setY(100);
        }
    }, [orientation]);
    return (react_1.default.createElement("div", { className: "treeChart", style: {
            width: '100%',
            height: '100em',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: nodeSvgShape.background,
        } },
        react_1.default.createElement("button", { onClick: changeOrientation }, "Click to change orientation"),
        react_1.default.createElement("div", { style: { width: '100%', height: '98em' } },
            react_1.default.createElement(TreeStyled, null,
                react_1.default.createElement(Name, { theme: nodeSvgShape.theme },
                    react_1.default.createElement(react_d3_tree_1.default, { translate: { x, y }, data: myTreeData, orientation: orientation, nodeSvgShape: nodeSvgShape, allowForeignObjects: true, nodeLabelComponent: {
                            render: react_1.default.createElement(NodeLabel_1.default, { className: "myLabelComponentInSvg", nodeData: { name: 'Node Name', attributes: [] } }),
                        }, textLayout: { textAnchor: 'start', x: 13, y: 0, transform: undefined } }))))));
};
exports.default = D3TreeChart;
//# sourceMappingURL=TreeView.js.map