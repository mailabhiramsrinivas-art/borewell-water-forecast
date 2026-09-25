window.SYNTHETIC_MODEL_READY = (async () => {
  if (!("DecompressionStream" in window)) {
    throw new Error("This browser cannot open the compressed 450-well dataset. Please use a current browser version.");
  }
  const response = await fetch(new URL("./synthetic_model.json.gz", document.currentScript.src));
  if (!response.ok || !response.body) throw new Error("The 450-well model data could not be loaded.");
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  window.SYNTHETIC_MODEL = JSON.parse(await new Response(stream).text());
  return window.SYNTHETIC_MODEL;
})();
