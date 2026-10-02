for (const name of ['test', 'limits-test']) {
  const child = Bun.spawn([process.execPath, `prototypes/library-preview/native/${name}.ts`, '--trust-native-fixture'], {
    stdout: 'inherit', stderr: 'inherit',
  });
  if (await child.exited) throw Error(`Native library preview ${name} failed`);
}
