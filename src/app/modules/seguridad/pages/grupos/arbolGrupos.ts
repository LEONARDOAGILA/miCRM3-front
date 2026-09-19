import { FileTreeNode } from '../../../../components/file-tree-node/file-tree-node.component';
import { GrupoModel } from '../../interfaces/grupoModel';

/**
 * Utilidades del árbol de grupos, compartidas por la pantalla de usuarios
 * y grupos y por el selector de grupo. Se reutiliza el nodo del
 * administrador de archivos (app-file-tree-node): un grupo es una "carpeta"
 * (escarpeta = true, acepta que se le suelten cosas encima).
 */

export interface OpcionesArbol {
  /** Ids de los grupos que se pintan abiertos. */
  abiertos?: Set<number>;
  seleccionadoId?: number | null;
  /** true: el contador muestra sólo los usuarios directos (por defecto cuenta también los de los subgrupos). */
  soloDirectos?: boolean;
  /** Sin contador. */
  sinContador?: boolean;
}

export function iconoGrupo(g: GrupoModel): string {
  if (g.es_administrador) { return 'fa fa-user-shield'; }
  return g.tipo_acceso === 'WEB' ? 'fa fa-globe' : 'fa fa-users';
}

/** Nodo del árbol para un grupo (sin hijos: los cuelga construirArbolGrupos). */
export function nodoDeGrupo(g: GrupoModel, op: OpcionesArbol): FileTreeNode {
  // El contador suma los subgrupos (como una carpeta cuenta lo que hay dentro);
  // el detalle directos / en subgrupos va en el tooltip.
  const directos = g.num_usuarios ?? 0;
  const total = g.num_usuarios_total ?? directos;
  const n = op.soloDirectos ? directos : total;
  const detalle = total > directos ? `${directos} directo(s) + ${total - directos} en subgrupos` : `${directos} usuario(s)`;
  return {
    id: g.id,
    nombre: g.nombre,
    tipo: 0,
    escarpeta: true,
    icono: iconoGrupo(g),
    color: g.activo ? undefined : 'var(--bs-secondary-color, #6c757d)',
    badge: op.sinContador ? null : n,
    titulo: [g.ruta, detalle, g.descripcion, g.activo ? '' : '(inactivo)'].filter(Boolean).join(' — '),
    isOpen: op.abiertos?.has(g.id) ?? false,
    isSelected: op.seleccionadoId === g.id,
  };
}

/** Lista plana (padre antes que hijos, como la devuelve el back) → árbol. */
export function construirArbolGrupos(grupos: GrupoModel[], op: OpcionesArbol = {}): FileTreeNode[] {
  const nodos = new Map<number, FileTreeNode>();
  const raices: FileTreeNode[] = [];
  for (const g of grupos) { nodos.set(g.id, nodoDeGrupo(g, op)); }
  for (const g of grupos) {
    const n = nodos.get(g.id)!;
    const padre = g.padre_id !== null ? nodos.get(g.padre_id) : undefined;
    if (padre) {
      (padre.children ??= []).push(n);
    } else {
      raices.push(n);
    }
  }
  return raices;
}

/** Devuelve el nodo si él o algún descendiente coincide; abre la rama. */
function filtrarNodo(node: FileTreeNode, q: string): FileTreeNode | null {
  if (node.nombre.toLowerCase().includes(q)) {
    return { ...node, isOpen: true };
  }
  const hijos = (node.children ?? [])
    .map(h => filtrarNodo(h, q))
    .filter((h): h is FileTreeNode => h !== null);
  return hijos.length ? { ...node, children: hijos, isOpen: true } : null;
}

/** Árbol filtrado por texto (copia); sin texto devuelve el original. */
export function filtrarArbol(nodes: FileTreeNode[], texto: string): FileTreeNode[] {
  const q = (texto ?? '').trim().toLowerCase();
  if (!q) { return nodes; }
  return nodes.map(n => filtrarNodo(n, q)).filter((n): n is FileTreeNode => n !== null);
}

export function buscarNodo(nodes: FileTreeNode[], id: number): FileTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) { return n; }
    const h = n.children ? buscarNodo(n.children, id) : null;
    if (h) { return h; }
  }
  return null;
}

export function recorrer(nodes: FileTreeNode[], fn: (n: FileTreeNode) => void): void {
  for (const n of nodes) {
    fn(n);
    if (n.children) { recorrer(n.children, fn); }
  }
}
