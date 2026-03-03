const profile = {
  services: {
    ServerStorage: { name: 'ServerStorage', src: 'src/ServerStorage' }
  }
};
const placeName = "StartPlace";
const tree = { $className: 'DataModel' };
for (const [serviceKey, svc] of Object.entries(profile.services)) {
  const parts = serviceKey.split('.');
  if (parts.length === 2) {
    const [parent, child] = parts;
    if (!tree[parent]) tree[parent] = { $className: parent };
    tree[parent][child] = {
      $className: child,
      $path: `${placeName}/${svc.src}`,
    };
  } else {
    tree[serviceKey] = {
      $className: serviceKey,
      $path: `${placeName}/${svc.src}`,
    };
  }
}
console.log(JSON.stringify(tree, null, 2));
