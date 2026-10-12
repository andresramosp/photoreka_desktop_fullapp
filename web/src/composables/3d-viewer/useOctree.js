import * as THREE from "three";

/**
 * Octree Node - Representa un nodo del árbol octree
 */
class OctreeNode {
  constructor(bounds, maxObjects = 8, maxLevels = 4, level = 0) {
    this.bounds = bounds; // THREE.Box3
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.level = level;
    this.objects = [];
    this.children = null;
  }

  /**
   * Subdivide el nodo en 8 octantes
   */
  subdivide() {
    const { min, max } = this.bounds;
    const center = new THREE.Vector3();
    this.bounds.getCenter(center);

    const subWidth = (max.x - min.x) / 2;
    const subHeight = (max.y - min.y) / 2;
    const subDepth = (max.z - min.z) / 2;

    this.children = [];

    // Crear 8 octantes (2x2x2)
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 2; z++) {
          const minX = x === 0 ? min.x : center.x;
          const minY = y === 0 ? min.y : center.y;
          const minZ = z === 0 ? min.z : center.z;

          const maxX = x === 0 ? center.x : max.x;
          const maxY = y === 0 ? center.y : max.y;
          const maxZ = z === 0 ? center.z : max.z;

          const childBounds = new THREE.Box3(
            new THREE.Vector3(minX, minY, minZ),
            new THREE.Vector3(maxX, maxY, maxZ)
          );

          this.children.push(
            new OctreeNode(
              childBounds,
              this.maxObjects,
              this.maxLevels,
              this.level + 1
            )
          );
        }
      }
    }
  }

  /**
   * Inserta un objeto en el nodo o sus hijos
   */
  insert(object) {
    // Si tiene hijos, intentar insertar en ellos
    if (this.children !== null) {
      const index = this.getChildIndex(object.position);
      if (index !== -1) {
        this.children[index].insert(object);
        return;
      }
    }

    // Añadir al nodo actual
    this.objects.push(object);

    // Si excede el límite y no está en el nivel máximo, subdividir
    if (
      this.objects.length > this.maxObjects &&
      this.level < this.maxLevels &&
      this.children === null
    ) {
      this.subdivide();

      // Redistribuir objetos existentes a los hijos
      let i = 0;
      while (i < this.objects.length) {
        const index = this.getChildIndex(this.objects[i].position);
        if (index !== -1) {
          this.children[index].insert(this.objects[i]);
          this.objects.splice(i, 1);
        } else {
          i++;
        }
      }
    }
  }

  /**
   * Determina qué hijo contiene una posición
   */
  getChildIndex(position) {
    if (this.children === null) return -1;

    const center = new THREE.Vector3();
    this.bounds.getCenter(center);

    let index = 0;
    if (position[0] >= center.x) index += 1;
    if (position[1] >= center.y) index += 2;
    if (position[2] >= center.z) index += 4;

    // Verificar que el objeto realmente esté en este hijo
    const childBounds = this.children[index].bounds;
    const point = new THREE.Vector3(position[0], position[1], position[2]);

    if (childBounds.containsPoint(point)) {
      return index;
    }

    return -1; // No está completamente en ningún hijo
  }

  /**
   * Busca objetos que intersectan con un frustum
   */
  queryFrustum(frustum, results = []) {
    // Verificar si el frustum intersecta este nodo
    if (!frustum.intersectsBox(this.bounds)) {
      return results;
    }

    // Añadir objetos de este nodo
    results.push(...this.objects);

    // Buscar en hijos si existen
    if (this.children !== null) {
      for (const child of this.children) {
        child.queryFrustum(frustum, results);
      }
    }

    return results;
  }

  /**
   * Busca objetos dentro de un radio desde un punto
   */
  queryRadius(point, radius, results = []) {
    // Crear esfera para test
    const sphere = new THREE.Sphere(
      new THREE.Vector3(point[0], point[1], point[2]),
      radius
    );

    // Verificar si la esfera intersecta este nodo
    if (!sphere.intersectsBox(this.bounds)) {
      return results;
    }

    // Comprobar objetos de este nodo
    for (const obj of this.objects) {
      const objPos = new THREE.Vector3(
        obj.position[0],
        obj.position[1],
        obj.position[2]
      );
      if (objPos.distanceTo(sphere.center) <= radius) {
        results.push(obj);
      }
    }

    // Buscar en hijos si existen
    if (this.children !== null) {
      for (const child of this.children) {
        child.queryRadius(point, radius, results);
      }
    }

    return results;
  }

  /**
   * Cuenta el número total de objetos en el árbol
   */
  count() {
    let total = this.objects.length;
    if (this.children !== null) {
      for (const child of this.children) {
        total += child.count();
      }
    }
    return total;
  }

  /**
   * Obtiene información de depuración
   */
  getDebugInfo() {
    const info = {
      level: this.level,
      objectCount: this.objects.length,
      hasChildren: this.children !== null,
      bounds: {
        min: this.bounds.min.toArray(),
        max: this.bounds.max.toArray(),
      },
    };

    if (this.children !== null) {
      info.children = this.children.map((child) => child.getDebugInfo());
    }

    return info;
  }

  /**
   * Obtiene todos los bounds para visualización
   */
  getAllBounds(boundsList = []) {
    boundsList.push(this.bounds);
    if (this.children !== null) {
      for (const child of this.children) {
        child.getAllBounds(boundsList);
      }
    }
    return boundsList;
  }
}

/**
 * Octree - Estructura de datos espacial para acelerar búsquedas 3D
 */
class Octree {
  constructor(maxObjects = 8, maxLevels = 4) {
    this.maxObjects = maxObjects;
    this.maxLevels = maxLevels;
    this.root = null;
  }

  /**
   * Construye el octree desde un array de objetos con posiciones
   */
  build(objects) {
    if (!objects || objects.length === 0) {
      this.root = null;
      return;
    }

    // Calcular bounds del espacio total
    const bounds = this.calculateBounds(objects);

    // Expandir un poco los bounds para evitar problemas en los bordes
    bounds.expandByScalar(1.0);

    // Crear nodo raíz
    this.root = new OctreeNode(bounds, this.maxObjects, this.maxLevels, 0);

    // Insertar todos los objetos
    for (const obj of objects) {
      this.root.insert(obj);
    }

    console.log("🌳 Octree construido:", {
      totalObjects: objects.length,
      objectsInTree: this.root.count(),
      maxLevels: this.maxLevels,
      maxObjects: this.maxObjects,
      bounds: {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
      },
    });
  }

  /**
   * Calcula los bounds de todos los objetos
   */
  calculateBounds(objects) {
    const bounds = new THREE.Box3();

    for (const obj of objects) {
      const point = new THREE.Vector3(
        obj.position[0],
        obj.position[1],
        obj.position[2]
      );
      bounds.expandByPoint(point);
    }

    return bounds;
  }

  /**
   * Busca objetos visibles por un frustum
   */
  queryFrustum(frustum) {
    if (!this.root) return [];
    return this.root.queryFrustum(frustum, []);
  }

  /**
   * Busca objetos dentro de un radio
   */
  queryRadius(point, radius) {
    if (!this.root) return [];
    return this.root.queryRadius(point, radius, []);
  }

  /**
   * Obtiene información de depuración del árbol
   */
  getDebugInfo() {
    if (!this.root) return null;
    return this.root.getDebugInfo();
  }

  /**
   * Obtiene todos los bounds para visualización
   */
  getAllBounds() {
    if (!this.root) return [];
    return this.root.getAllBounds([]);
  }

  /**
   * Limpia el octree
   */
  clear() {
    this.root = null;
  }
}

/**
 * Composable para usar Octree en componentes Vue
 */
export function useOctree(maxObjects = 8, maxLevels = 4) {
  const octree = new Octree(maxObjects, maxLevels);

  /**
   * Construye el octree desde un array de objetos
   */
  const buildOctree = (objects) => {
    octree.build(objects);
  };

  /**
   * Busca objetos visibles usando frustum culling
   */
  const queryFrustum = (frustum) => {
    return octree.queryFrustum(frustum);
  };

  /**
   * Busca objetos dentro de un radio
   */
  const queryRadius = (point, radius) => {
    return octree.queryRadius(point, radius);
  };

  /**
   * Obtiene estadísticas del octree
   */
  const getStats = () => {
    if (!octree.root) {
      return {
        totalObjects: 0,
        maxLevels: maxLevels,
        maxObjects: maxObjects,
      };
    }

    return {
      totalObjects: octree.root.count(),
      maxLevels: maxLevels,
      maxObjects: maxObjects,
      debugInfo: octree.getDebugInfo(),
    };
  };

  /**
   * Obtiene todos los bounds para visualización
   */
  const getAllBounds = () => {
    return octree.getAllBounds();
  };

  /**
   * Limpia el octree
   */
  const clear = () => {
    octree.clear();
  };

  return {
    buildOctree,
    queryFrustum,
    queryRadius,
    getStats,
    getAllBounds,
    clear,
  };
}

export { Octree, OctreeNode };
