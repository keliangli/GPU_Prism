// Scene identities survive a rebuild; explanation categories may have many instances.
export function sceneInstanceKey(model, lod, layer, category, ordinal) {
  return `${model}/lod-${lod}/layer-${layer}/${category}/${ordinal}`;
}

export function resolveFlowNodes(points, nodes, categories = null) {
  if (categories) return nodes.filter(n => categories.includes(n.userData.nodeId)).map(n => n.userData.instanceKey);
  // Legacy paths contain component centres as waypoints. Only exact anchors are
  // resolved: a curved control point must never imply a dependency on a neighbour.
  const keys = [];
  for (const point of points) for (const node of nodes) {
    if (point.distanceToSquared(node.position) < 0.04 && !keys.includes(node.userData.instanceKey)) keys.push(node.userData.instanceKey);
  }
  return keys;
}

export function flowMatchesFocus(edge, focusedKeys, residual = false) {
  if (!focusedKeys) return true;
  if (residual) return edge.role === 'residual';
  return edge.nodeKeys.some(key => focusedKeys.has(key));
}
