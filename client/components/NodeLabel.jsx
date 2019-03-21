import React from 'react';

const divStyle = {
	display: 'flex',
	flexDirection: 'column',
	width: 700,
	height: 600
}

class NodeLabel extends React.PureComponent {
	constructor (props) {
		super(props)
		this.state = {
			isHidden: true,
			display: block
		}
	}

	toggleHidden () {
		this.setState({
		  isHidden: !this.state.isHidden,
		  display: block	
		})
	}	
	
	render() {
		const { className, nodeData } = this.props
		return (
			<div className={className} style={divStyle} onMouseEnter={this.toggleHidden.bind(this)} onMouseLeave={this.toggleHidden.bind(this)}>
				<span>{nodeData.name}</span>
				<span>{nodeData.attributes}</span>
			</div>
		)
	}
}

export default NodeLabel;
