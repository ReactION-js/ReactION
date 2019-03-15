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
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
		font-size: large;
		fill: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
	}
	.nodeAttributesBase{
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
	}
`


const myTreeData = [
	{
		name: 'Top Level',
		props: {
			keyA: 'val A',
			keyB: 'val B',
			keyC: 'val C',
		},
		children: [
			{
				name: 'Level 2: A',
				props: {
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
					strokeWidth: '3px',
					nodeNameBase: '#F8F8F8',
				},
				theme: 'dark',
				background: '#181818',
			},
		}

		this.changeOrientation = this.changeOrientation.bind(this);
		this.changeTheme = this.changeTheme.bind(this);
	}

	mouseOver(nodeData, e) {
		nodeData
	}

	mouseOut(nodeData, e) {
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
		const { theme } = this.state.nodeSvgShape;
		if (theme === 'dark') {
			this.setState({
				nodeSvgShape: {
					shape: 'circle',
					shapeProps: {
						r: 15,
						fill: '#FFAA00',
						stroke: '#181818',
						strokeWidth: '3px',
						nodeNameBase: '#181818',
					},
					theme: 'light',
					background: '#F8F8F8'
				},
			});
		} else {
			this.setState({
				nodeSvgShape: {
					shape: 'circle',
					shapeProps: {
						r: 15,
						fill: '#FFAA00',
						stroke: '#F8F8F8',
						strokeWidth: '3px',
						nodeNameBase: '#F8F8F8',
					},
					theme: 'dark',
					background: '#181818',
				},
			})
		}
	};


	render() {
		const { orientation, nodeSvgShape } = this.state;
		const { background } = this.state.nodeSvgShape;
		// const { nodeNameBase } = this.state.nodeSvgShape.shapeProps;

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