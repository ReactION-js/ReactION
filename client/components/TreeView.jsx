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
		// this.mouseOver = this.mouseOver.bind(this);
		this.state = {
			orientation: 'vertical',
			x: 250,
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
			theme: 'dark',
			background: '#181818',
		}

		this.changeOrientation = this.changeOrientation.bind(this);
		this.changeTheme = this.changeTheme.bind(this);
	}

	// mouseOver(e) {
	// 	cosnt VARNAME = {
	// 		// put what we want to show in mouseOver
	// 	}
	// }

	// mouseOut(e){

	// }

	changeOrientation() {
		const { orientation } = this.state;
		if (orientation === 'vertical') {
			this.setState({ orientation: 'horizontal', x: 100, y: 100 });
		} else {
			this.setState({ orientation: 'vertical', x: 250, y: 100 })
		}
	}

	changeTheme() {
		const { theme } = this.state;
		if (theme === 'dark') {
			this.setState({
				theme: 'light', background: '#F8F8F8'
			});
			console.log('light: ', this.state.background)
		} else {
			this.setState({
				theme: 'dark', background: '#181818'
			})
		}
	};


	render() {
		const { orientation, nodeSvgShape, background } = this.state;
		console.log('links: ', document.querySelectorAll("p.linkBase"))
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
						<Tree
							translate={{ x: this.state.x, y: this.state.y }}
							data={myTreeData}
							orientation={orientation}
							nodeSvgShape={nodeSvgShape}
						/>
					</TreeStyled>
				</div>
			</div>
		);
	}
}

export default D3TreeChart;