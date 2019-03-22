import React, { Component } from 'react';
import Tree from 'react-d3-tree';
import NodeLabel from './NodeLabel.jsx';
import styled from 'styled-components';

const TreeStyled = styled.path`
	.linkBase {
		fill: none;
		stroke: #D3D3D3;
    stroke-width: 2px;
	}
	font-family: 'Crimson Text', serif
`;

const Name = styled.g`
	.nodeNameBase {
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
		font-size: large;
		fill: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
	}
	.nodeAttributesBase{
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
	}
`
const myTreeData = window._TREE_DATA;

class D3TreeChart extends Component {
	constructor(props) {
		super(props);
		this.state = {
			orientation: 'vertical',
			x: 200,
			y: 100,
			nodeSvgShape: {
				shape: 'circle',
				shapeProps: {
					r: 10,
					fill: '#1E1E1E',
					stroke: '#181818',
					strokeWidth: '0px',
					nodeNameBase: '#1E1E1E',
				},
				theme: 'light',
				background: 'rgb(255,255,255)'
			},
			theme: 'dark',
			background: '#181818'
		}
		this.changeOrientation = this.changeOrientation.bind(this);
		// this.changeTheme = this.changeTheme.bind(this);
	}


	changeOrientation() {
		const { orientation } = this.state;
		if (orientation === 'vertical') {
			this.setState({ orientation: 'horizontal', x: 100, y: 100 });
		} else {
			this.setState({ orientation: 'vertical', x: 200, y: 100 })
		}
	}

	// changeTheme() {
	// 	const { theme } = this.state.nodeSvgShape;
	// 	if (theme === 'dark') {
	// 		this.setState({
	// 			nodeSvgShape: {
	// 				shape: 'circle',
	// 				shapeProps: {
	// 					r: 10,
	// 					fill: '#1E1E1E',
	// 					stroke: '#181818',
	// 					strokeWidth: '0px',
	// 					nodeNameBase: '#1E1E1E',
	// 				},
	// 				theme: 'light',
	// 				background: 'rgb(255,255,255)'
	// 			},
	// 		});
	// 	} else {
	// 		this.setState({
	// 			nodeSvgShape: {
	// 				shape: 'circle',
	// 				shapeProps: {
	// 					r: 10,
	// 					fill: '#F8F8F8',
	// 					stroke: '#F8F8F8',
	// 					strokeWidth: '0px',
	// 					nodeNameBase: '#F8F8F8',
	// 				},
	// 				theme: 'dark',
	// 				background: '#1E1E1E',
	// 			},
	// 		})
	// 	}
	// };


	render() {
		const { orientation, nodeSvgShape } = this.state;
		const { background } = this.state.nodeSvgShape;

		return (
			<div className='treeChart'
				style={{ width: '100%', height: '100em', display: 'flex', flexDirection: 'column', backgroundColor: background }}
			>
				<button
					onClick={this.changeOrientation}
					counter='Orientation'
				>click to change orientation</button>
				{/* <button
					onClick={this.changeTheme}
					counter='Background'
				>click to change Theme</button>
				<br></br> */}
				<div style={{ width: '100%', height: '98em' }}>
					<TreeStyled>
						<Name>
							<Tree
								translate={{ x: this.state.x, y: this.state.y }}
								data={myTreeData}
								onMouseOver={this.mouseOver}
								onMouseOut={this.mouseOut}
								orientation={orientation}
								nodeSvgShape={nodeSvgShape}
								allowForeignObjects
								nodeLabelComponent={{
									render:
										<NodeLabel className='myLabelComponentInSvg' />,
								}}
								textLayout={{ textAnchor: "start", x: 13, y: 0, transform: undefined }}
							/>
						</Name>
					</TreeStyled>
				</div>
			</div>
		);
	}
}

export default D3TreeChart;
