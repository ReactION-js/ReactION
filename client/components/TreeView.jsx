import React, { Component } from 'react';
import Tree from 'react-d3-tree';
// import styled from 'styled-components'

// const TreeStyled = styled.div`
// // styling for the tree 
// `;

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
			y: 100
			// theme: 'dark'
		}
		this.changeOrientation = this.changeOrientation.bind(this);
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

	// changeTheme() {
	// 	// Write codes that changes the theme
	// };

	render() {
		const { orientation } = this.state;
		return (
			<div
				style={{ width: '100%', height: '100em', display: 'flex', flexDirection: 'column' }}
			>
				<button
					onClick={this.changeOrientation}
					counter='Orientation'
				>click to change orientation</button>
				<br></br>
				<div style={{ width: '100%', height: '98em', }}>
					<Tree
						translate={{ x: this.state.x, y: this.state.y }}
						data={myTreeData}
						orientation={orientation}
					// onMouseOver={this.mouseOver}
					// zoomable="true"
					/>
				</div>
			</div>
		);
	}
}

export default D3TreeChart;