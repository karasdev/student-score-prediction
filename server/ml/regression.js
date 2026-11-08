// Weighted ridge regression on standardized features. No dependencies.
//
//   score = intercept + w1*z1 + w2*z2 + ...      where z = (value - mean) / std
//
// Standardizing puts every factor on the same scale, so the learned weights can be
// compared with each other: "points of score per 1 standard deviation of the factor".
// We also return the raw weights: "points of score per 1 unit" (per hour, per %, ...).

// Errors meant for the user (bad data, missing setup) - the API returns them as 400
const userError = (msg) => Object.assign(new Error(msg), { status: 400 });

function fit(rows, featureKeys, options) {
  const opts = options || {};
  const lambda = opts.lambda == null ? 1 : opts.lambda;
  const sampleWeights = opts.sampleWeights || rows.map(() => 1);
  const n = rows.length;
  const k = featureKeys.length;
  if (n < k + 2) throw userError(`Need at least ${k + 2} training rows, got ${n}`);

  // 1) mean and std of each feature
  const means = featureKeys.map((f) => rows.reduce((s, r) => s + r.x[f], 0) / n);
  const stds = featureKeys.map((f, j) => {
    const v = rows.reduce((s, r) => s + (r.x[f] - means[j]) ** 2, 0) / n;
    return Math.sqrt(v) || 1; // a constant feature gets std 1 to avoid dividing by 0
  });
  const standardize = (x) => [1, ...featureKeys.map((f, j) => (x[f] - means[j]) / stds[j])];

  // 2) build (Zᵀ W Z + λI) β = Zᵀ W y
  const A = Array.from({ length: k + 1 }, () => new Array(k + 1).fill(0));
  const b = new Array(k + 1).fill(0);
  rows.forEach((r, i) => {
    const z = standardize(r.x);
    const w = sampleWeights[i];
    for (let p = 0; p <= k; p++) {
      b[p] += w * z[p] * r.y;
      for (let q = 0; q <= k; q++) A[p][q] += w * z[p] * z[q];
    }
  });
  for (let j = 1; j <= k; j++) A[j][j] += lambda; // don't penalize the intercept

  // 3) solve
  const beta = solve(A, b);
  const intercept = beta[0];
  const coefStd = beta.slice(1);
  const coefRaw = coefStd.map((c, j) => c / stds[j]);
  const rawIntercept = intercept - coefStd.reduce((s, c, j) => s + (c * means[j]) / stds[j], 0);

  const model = { features: featureKeys, means, stds, intercept, coefStd, coefRaw, rawIntercept };
  model.trainMae = mae(model, rows);
  return model;
}

function predict(model, x) {
  let y = model.intercept;
  model.features.forEach((f, j) => {
    y += model.coefStd[j] * ((x[f] - model.means[j]) / model.stds[j]);
  });
  return Math.min(100, Math.max(0, y));
}

function mae(model, rows) {
  if (!rows.length) return null;
  return rows.reduce((s, r) => s + Math.abs(predict(model, r.x) - r.y), 0) / rows.length;
}

// Gaussian elimination with partial pivoting
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw userError("Cannot solve: features are linearly dependent");
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let q = c; q <= n; q++) M[r][q] -= f * M[c][q];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let q = r + 1; q < n; q++) s -= M[r][q] * x[q];
    x[r] = s / M[r][r];
  }
  return x;
}

module.exports = { fit, predict, mae };
