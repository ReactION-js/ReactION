import React, { Component } from 'react';
import Tree from 'react-d3-tree';

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
	render() {
		return (
			<div>
				<Tree data={myTreeData} />
			</div>
		);
	}
}

export default D3TreeChart;