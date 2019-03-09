module.exports = {
	fiberNodeParse: async () => {

		const _handler = Object.values(window.__REACT_DEVTOOLS_GLOBAL_HOOK__._fiberRoots)[0].entries().next().value[0].current;

		function fiberWalk(entry) {
			let output = [];
			function recurse(root, level) {
				// console.log(root, 'root')

				if (root.sibling !== null) {
					output.push({ "name": root.sibling, "level": level });
					recurse(root.sibling, level);
				}
				if (root.child !== null) {
					output.push({ "name": root.child, "level": level + 1 });
					recurse(root.child, level + 1);
				}
				else {
					return
				}
			}
			recurse(entry, 0);

			// console.log(output, 'output')
			output.sort((a, b) => a[1] - b[1]);
			output.forEach((el, idx) => {
				// console.log(el);
				if (typeof el.name.type === null) { el.name = ''; }
				if (typeof el.name.type === 'function' && el.name.type.name) el.name = el.name.type.name;
				if (typeof el.name.type === 'function') el.name = 'function';
				if (typeof el.name.type === 'object') el.name = 'function';
				if (typeof el.name.type === 'string') el.name = el.name.type;
				el['id'] = idx;
				el['parent'] = idx === 0 ? null : el.level - 1;
			});
			return output;

		};

		console.log(_handler);

		return fiberWalk(_handler);

	}
}
