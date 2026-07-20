globalThis.foundry = {
  utils: {
    deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
    },
  },
};
