const dateAvg = (a, b) => new Date(Math.floor((a.getTime() + b.getTime()) / 2));
const importers = {};

importers["app.datadoghq.com"] = (url) => {
  const qp = url.searchParams;

  if (qp.get("fullscreen_start_ts")) {
    const from = new Date(parseInt(qp.get("fullscreen_start_ts")));
    const to = new Date(parseInt(qp.get("fullscreen_end_ts")));
    return {
      from,
      to,
      anchor: dateAvg(from, to),
    };
  }

  if (qp.get("from_ts")) {
    const from = new Date(parseInt(qp.get("from_ts")));
    const to = new Date(parseInt(qp.get("to_ts")));
    return {
      from,
      to,
      anchor: dateAvg(from, to),
    };
  }

  throw new Error("No timestamps in datadog url");
};

importers["vividcortex"] = (url) => {
  const qp = url.searchParams;
  const from = new Date(1000 * parseInt(qp.get("from")));
  const to = new Date(1000 * parseInt(qp.get("until")));
  return {
    from,
    to,
    anchor: dateAvg(from, to),
  };
};

window.importTimestamps = (urlString) => {
  const url = new URL(urlString);

  for (const key of Object.keys(importers)) {
    if (url.host.includes(key)) {
      return importers[key](url);
    }
  }

  throw new Error("No importer for current page");
};
