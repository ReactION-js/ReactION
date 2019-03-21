import React from 'react';

const divStyle = {
	display: 'flex',
	flexDirection: 'column'
}

class NodeLabel extends React.PureComponent {
	render() {
		const { className, nodeData } = this.props
		return (
			<div className={className} style={divStyle}>
				<h2>{nodeData.name}</h2>
				<p>{nodeData.attributes}</p>
			</div>
		)
	}
}

export default NodeLabel;
