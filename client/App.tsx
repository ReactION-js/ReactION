import React, { Component } from 'react';
import D3TreeChart from './components/TreeView';

interface Props {}

class App extends Component<Props> {
	render() {
		return (
			<div>
				<D3TreeChart />
			</div>
		);
	}
}

export default App;
