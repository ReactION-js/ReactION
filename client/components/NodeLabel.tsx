import React, { useState, CSSProperties } from 'react';

interface NodeLabelProps {
  className: string;
  nodeData: {
    name: string;
    attributes: string[];
  };
}

const NodeLabel: React.FC<NodeLabelProps> = ({ className, nodeData }) => {
  const [divStyle, setDivStyle] = useState<CSSProperties>({
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

  const elArr = nodeData.attributes.map((el, index) => (
    <p key={index}>{el}</p>
  ));

  return (
    <div className={className} onMouseEnter={mouseEnter} onMouseOut={mouseOut}>
      <h2>{nodeData.name}</h2>
      <div style={divStyle}>
        {elArr}
      </div>
    </div>
  );
};

export default NodeLabel;
