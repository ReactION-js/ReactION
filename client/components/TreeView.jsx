import React, { useState } from 'react';
import Tree from 'react-d3-tree';
import styled from 'styled-components'

const TreeStyled = styled.path`
	.linkBase {
		fill: none;
		stroke: #D3D3D3;
    stroke-width: 3px;
	}
`;

const Button = styled.div`
	display: flex;
	flex-direction: column;
	.button{
		background: 'white'
		color: 'black'
		font-size: 1em;
		margin: 1em;
		padding: 0.25em 1em;
		border: 2px solid black;
		border-radius: 3px;
	}
`

const Name = styled.g`
	.nodeNameBase {
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
		font-size: large;
		fill: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')}
	}
	.nodeAttributesBase{
		stroke: ${props => (props.children.props.nodeSvgShape.theme === 'light' ? '#181818' : '#F8F8F8')};
		display : ${props => (props.children.props.nodeSvgShape.mouseOver === 'true' ? '#181818' : '#F8F8F8')};
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

		this.state = {
			orientation: 'vertical',
			x: 200,
			y: 100,
			nodeSvgShape: {
				shape: 'circle',
				display: 'none',
				shapeProps: {
					r: 15,
					fill: '#FFAA00',
					stroke: '#D3D3D3',
					strokeWidth: '3px',
				},
				theme: 'dark',
				mouseOver: 'false',
				background: '#181818'
			},
		}

		this.changeOrientation = this.changeOrientation.bind(this);
		this.changeTheme = this.changeTheme.bind(this);

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

		return (
			<div
				style={{ width: '100%', height: '100em', display: 'flex', flexDirection: 'column', backgroundColor: background }}
			>
				<Button>
					<button
						onClick={this.changeOrientation}
						counter='Orientation'
					>click to change orientation</button>
					<button
						onClick={this.changeTheme}
						counter='Background'
					>click to change Theme</button>
				</Button>
				<br></br>
				<div style={{ width: '100%', height: '98em' }}>
					<TreeStyled>
						<Name>
							<Tree
								translate={{ x: this.state.x, y: this.state.y }}
								data={myTreeData}
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