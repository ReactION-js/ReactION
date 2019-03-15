import React, { Component } from 'react';
import Tree from 'react-d3-tree';
import styled from 'styled-components'

const TreeStyled = styled.path`
	.linkBase {
		fill: none;
		stroke: #D3D3D3;
    stroke-width: 3px;
	}
`;

const Name = styled.g`
	.nodeNameBase {
		stroke: #D3D3D3;
	}
`


const myTreeData = [
	{
		name: 'Top Level',
		attributes: {
			keyA: 'val A',
			keyB: 'val B',
			keyC: 'val C',
		},
		children: [
			{
				name: 'Level 2: A',
				attributes: {
					keyA: 'val A',
					keyB: 'val B',
					keyC: 'val C',
				},
			},
			{
				name: 'Level 2: B',
			},
		],
	},
];

class D3TreeChart extends Component {
	constructor(props) {
		super(props);
		this.mouseOver = this.mouseOver.bind(this);
		this.mouseOut = this.mouseOut.bind(this);
		this.state = {
			orientation: 'vertical',
			x: 200,
			y: 100,
			nodeSvgShape: {
				shape: 'circle',
				shapeProps: {
					r: 15,
					fill: '#FFAA00',
					stroke: '#D3D3D3',
					strokeWidth: '3px'
				},
			},
			nodeNameBase: '#F8F8F8',
			theme: 'dark',
			background: '#181818',
		}

		this.changeOrientation = this.changeOrientation.bind(this);
		this.changeTheme = this.changeTheme.bind(this);
	}

	mouseOver(nodeData, e) {
		nodeData
	}

	mouseOut(nodeData, e) {
		console.log(nodeData)
		this.nodeData.setState({
			nodeSvgShape: {
				shape: 'circle',
				shapeProps: {
					r: 15,
					fill: '#FFAA00',
					stroke: '#D3D3D3',
					strokeWidth: '3px'
				},
			}
		})
	}


	changeOrientation() {
		const { orientation } = this.state;
		if (orientation === 'vertical') {
			this.setState({ orientation: 'horizontal', x: 100, y: 100 });
		} else {
			this.setState({ orientation: 'vertical', x: 200, y: 100 })
		}
	}

	changeTheme() {
		const { theme } = this.state;
		if (theme === 'dark') {
			this.setState({
				theme: 'light',
				background: '#F8F8F8',
				nodeNameBase: {
					stroke: '#181818',
				},
				nodeAttributesBase: {
					stroke: '#181818'
				}
			});
		} else {
			this.setState({
				theme: 'dark',
				background: '#181818',
				nodeNameBase: {
					stroke: '#F8F8F8',
				},
				nodeAttributesBase: {
					stroke: '#F8F8F8'
				}
			})
		}
	};


	render() {
		const { orientation, nodeSvgShape, background } = this.state;
		return (
			<div
				style={{ width: '100%', height: '100em', display: 'flex', flexDirection: 'column', backgroundColor: background }}
			>
				<button
					onClick={this.changeOrientation}
					counter='Orientation'
				>click to change orientation</button>
				<button
					onClick={this.changeTheme}
					counter='Background'
				>click to change Theme</button>
				<br></br>
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
								textLayout={{ textAnchor: "start", x: 20, y: -20, transform: undefined }}
							/>
						</Name>
					</TreeStyled>
				</div>
			</div>
		);
	}
}

export default D3TreeChart;