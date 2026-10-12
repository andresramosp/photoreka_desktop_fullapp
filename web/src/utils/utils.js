export function hungarian(matrix) {
  const n = matrix.length;
  const m = matrix[0].length;
  const size = Math.max(n, m);

  // Creamos una copia de la matriz, rellenando con ceros
  const cost = [];
  for (let i = 0; i < size; i++) {
    cost[i] = [];
    for (let j = 0; j < size; j++) {
      cost[i][j] = i < n && j < m ? matrix[i][j] : 0;
    }
  }

  // Resta el mínimo de cada fila
  for (let i = 0; i < size; i++) {
    const minVal = Math.min(...cost[i]);
    for (let j = 0; j < size; j++) {
      cost[i][j] -= minVal;
    }
  }

  // Resta el mínimo de cada columna
  for (let j = 0; j < size; j++) {
    let colVals = [];
    for (let i = 0; i < size; i++) {
      colVals.push(cost[i][j]);
    }
    const minVal = Math.min(...colVals);
    for (let i = 0; i < size; i++) {
      cost[i][j] -= minVal;
    }
  }

  const markedZeros = Array.from({ length: size }, () =>
    new Array(size).fill(0)
  );
  const rowCovered = new Array(size).fill(false);
  const colCovered = new Array(size).fill(false);

  // Marca ceros "estrella" (asignación provisional)
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (cost[i][j] === 0 && !rowCovered[i] && !colCovered[j]) {
        markedZeros[i][j] = 1;
        rowCovered[i] = true;
        colCovered[j] = true;
      }
    }
  }
  rowCovered.fill(false);
  colCovered.fill(false);

  const coverColumnsWithStarredZero = () => {
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (markedZeros[i][j] === 1) {
          colCovered[j] = true;
        }
      }
    }
  };

  coverColumnsWithStarredZero();

  const findZero = () => {
    for (let i = 0; i < size; i++) {
      if (!rowCovered[i]) {
        for (let j = 0; j < size; j++) {
          if (!colCovered[j] && cost[i][j] === 0) {
            return { i, j };
          }
        }
      }
    }
    return null;
  };

  while (colCovered.filter((c) => c).length < size) {
    const z = findZero();
    if (z) {
      markedZeros[z.i][z.j] = 2; // "primado"
      const starCol = markedZeros[z.i].findIndex((val) => val === 1);
      if (starCol !== -1) {
        rowCovered[z.i] = true;
        colCovered[starCol] = false;
      } else {
        // Construye y alterna la ruta de primados y estrellas
        let series = [z];
        let done = false;
        while (!done) {
          let starRow = -1;
          for (let i = 0; i < size; i++) {
            if (markedZeros[i][series[series.length - 1].j] === 1) {
              starRow = i;
              break;
            }
          }
          if (starRow !== -1) {
            series.push({ i: starRow, j: series[series.length - 1].j });
          } else {
            done = true;
            break;
          }
          const primeCol = markedZeros[series[series.length - 1].i].findIndex(
            (val) => val === 2
          );
          series.push({ i: series[series.length - 1].i, j: primeCol });
        }
        // Alterna las marcas de la ruta
        for (let { i, j } of series) {
          if (markedZeros[i][j] === 1) {
            markedZeros[i][j] = 0;
          } else if (markedZeros[i][j] === 2) {
            markedZeros[i][j] = 1;
          }
        }
        // Limpia marcas "primadas"
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < size; j++) {
            if (markedZeros[i][j] === 2) markedZeros[i][j] = 0;
          }
        }
        rowCovered.fill(false);
        colCovered.fill(false);
        coverColumnsWithStarredZero();
      }
    } else {
      // Ajusta la matriz
      let minVal = Infinity;
      for (let i = 0; i < size; i++) {
        if (!rowCovered[i]) {
          for (let j = 0; j < size; j++) {
            if (!colCovered[j] && cost[i][j] < minVal) {
              minVal = cost[i][j];
            }
          }
        }
      }
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          if (rowCovered[i]) cost[i][j] += minVal;
          if (!colCovered[j]) cost[i][j] -= minVal;
        }
      }
    }
  }

  // Extrae la asignación final a partir de los ceros "estrellados"
  const result = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (markedZeros[i][j] === 1) {
        result[i] = j;
        break;
      }
    }
  }
  return result;
}

export function shortenTag(tag) {
  return tag;
  // Note: NLP processing commented out as compromise library is not installed
  // const doc = nlp(tag);
  // doc.match("#Adjective").delete();
  // doc.match("#Adverb").delete();
  // return doc.text().trim();
}

export function isMobileDevice() {
  const userAgent = navigator.userAgent.toLowerCase();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // Check if it's a mobile device but not a tablet
  const isMobile =
    /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet =
    /ipad|android(?!.*mobile)|tablet|playbook|silk/i.test(userAgent) ||
    (screenWidth >= 768 && screenHeight >= 1024) ||
    (screenWidth >= 1024 && screenHeight >= 768);

  // Also check screen size - mobile phones typically have smaller screens
  const isSmallScreen = screenWidth < 768;

  // Additional check for touch devices with small screens
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;

  return (isMobile || (isSmallScreen && isTouchDevice)) && !isTablet;
}
