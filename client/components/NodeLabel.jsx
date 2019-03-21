import React from 'react';



class NodeLabel extends React.PureComponent {
	constructor() {
		super();
		this.state = {
			divStyle: {
				display: "none",
				flexDirection: 'column'
			}
		}
		this.mouseEnter = this.mouseEnter.bind(this);
		this.mouseOut = this.mouseOut.bind(this);
	}

	mouseEnter() {
		console.log('mouse entered')
		this.setState({
			divStyle: {
				display: "flex",
				flexDirection: 'column'
			}
		})
	}

	mouseOut() {
		console.log('mouse out')
		this.setState({
			divStyle: {
				display: "none",
				flexDirection: 'column'
			}
		})
	}

	render() {
		const { className, nodeData } = this.props
		const elArr = []
		nodeData.attributes.map((el) => {
			elArr.push(<p>{el}</p>)
		})

		return (
			<div className={className} onMouseEnter={this.mouseEnter} onMouseOut={this.mouseOut}>
				<h2>{nodeData.name}</h2>
				<div
					style={this.state.divStyle}
				>
					{elArr}
				</div>
			</div>
		)
	}
}

export default NodeLabel;
