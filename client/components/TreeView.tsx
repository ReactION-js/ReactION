import React, { useState, useCallback } from 'react';
import Tree from 'react-d3-tree';
import NodeLabel from './NodeLabel';
import styled from 'styled-components';

const TreeStyled = styled.div`
  .linkBase {
    fill: none;
    stroke: #d3d3d3;
    stroke-width: 2px;
  }
  font-family: 'Crimson Text', serif;
`;

const Name = styled.g<{ theme: string }>`
  .nodenamebase {
    stroke: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
    font-size: large;
    fill: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
  }
  .nodeAttributesBase {
    stroke: ${(props) => (props.theme === 'light' ? '#181818' : '#f8f8f8')};
  }
`;

const myTreeData = (window as any)._TREE_DATA;

const D3TreeChart: React.FC = () => {
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const [x, setX] = useState<number>(200);
  const [y, setY] = useState<number>(100);
  const [nodeSvgShape, setNodeSvgShape] = useState({
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

  const changeOrientation = useCallback(() => {
    if (orientation === 'vertical') {
      setOrientation('horizontal');
      setX(100);
      setY(100);
    } else {
      setOrientation('vertical');
      setX(200);
      setY(100);
    }
  }, [orientation]);

  return (
    <div
      className="treeChart"
      style={{
        width: '100%',
        height: '100em',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: nodeSvgShape.background,
      }}
    >
      <button onClick={changeOrientation}>
        Click to change orientation
      </button>
      {/* <button
        onClick={this.changeTheme}
        counter='Background'
      >click to change Theme</button>
      <br></br> */}
      <div style={{ width: '100%', height: '98em' }}>
        <TreeStyled>
          <Name theme={nodeSvgShape.theme}>
            <Tree
              translate={{ x, y }}
              data={myTreeData}
              orientation={orientation}
              nodeSvgShape={nodeSvgShape}
              allowForeignObjects
              nodeLabelComponent={{
                render: <NodeLabel className="myLabelComponentInSvg" nodeData={{ name: 'Node Name', attributes: [] }} />,
              }}
              textLayout={{ textAnchor: 'start', x: 13, y: 0, transform: undefined }}
            />
          </Name>
        </TreeStyled>
      </div>
    </div>
  );
};

export default D3TreeChart;
