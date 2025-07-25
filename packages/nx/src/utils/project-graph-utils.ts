import { existsSync } from 'node:fs';
import { posix } from 'node:path';
import { ProjectGraph, ProjectGraphProjectNode } from '../config/project-graph';
import type { ProjectConfiguration } from '../config/workspace-json-project-json';
import { readCachedProjectGraph } from '../project-graph/project-graph';

export function projectHasTarget(
  project: ProjectGraphProjectNode,
  target: string
) {
  return !!(
    project.data &&
    project.data.targets &&
    project.data.targets[target]
  );
}

export function projectHasTargetAndConfiguration(
  project: ProjectGraphProjectNode,
  target: string,
  configuration: string
) {
  return (
    projectHasTarget(project, target) &&
    project.data.targets[target].configurations &&
    project.data.targets[target].configurations[configuration]
  );
}

export function getSourceDirOfDependentProjects(
  projectName: string,
  projectGraph: ProjectGraph = readCachedProjectGraph()
): [
  projectDirs: string[],
  // this is kept for backwards compatibility, but it's not used anymore
  warnings: string[]
] {
  if (!projectGraph.nodes[projectName]) {
    throw new Error(
      `Couldn't find project "${projectName}" in this Nx workspace`
    );
  }

  const nodeNames = findAllProjectNodeDependencies(projectName, projectGraph);
  return nodeNames.reduce(
    (result, nodeName) => {
      const sourceRoot = getProjectSourceRoot(
        projectGraph.nodes[nodeName].data
      );
      result[0].push(sourceRoot);
      return result;
    },
    [[], []] as [projectDirs: string[], warnings: string[]]
  );
}

/**
 * Find all internal project dependencies.
 * All the external (npm) dependencies will be filtered out unless includeExternalDependencies is set to true
 * @param {string} parentNodeName
 * @param {ProjectGraph} projectGraph
 * @param includeExternalDependencies
 * @returns {string[]}
 */
export function findAllProjectNodeDependencies(
  parentNodeName: string,
  projectGraph: ProjectGraph = readCachedProjectGraph(),
  includeExternalDependencies = false
): string[] {
  const dependencyNodeNames = new Set<string>();

  collectDependentProjectNodesNames(
    projectGraph as ProjectGraph,
    dependencyNodeNames,
    parentNodeName,
    includeExternalDependencies
  );

  return Array.from(dependencyNodeNames);
}

// Recursively get all the dependencies of the node
function collectDependentProjectNodesNames(
  nxDeps: ProjectGraph,
  dependencyNodeNames: Set<string>,
  parentNodeName: string,
  includeExternalDependencies: boolean
) {
  const dependencies = nxDeps.dependencies[parentNodeName];
  if (!dependencies) {
    // no dependencies for the given node, so silently return,
    // as we probably wouldn't want to throw here
    return;
  }

  for (const dependency of dependencies) {
    const dependencyName = dependency.target;

    // skip dependencies already added (avoid circular dependencies)
    if (dependencyNodeNames.has(dependencyName)) {
      continue;
    }

    // we're only interested in internal nodes, not external
    if (nxDeps.externalNodes?.[dependencyName]) {
      if (includeExternalDependencies) {
        dependencyNodeNames.add(dependencyName);
      } else {
        continue;
      }
    }

    dependencyNodeNames.add(dependencyName);

    // Get the dependencies of the dependencies
    collectDependentProjectNodesNames(
      nxDeps,
      dependencyNodeNames,
      dependencyName,
      includeExternalDependencies
    );
  }
}

export function getProjectSourceRoot(
  project: ProjectConfiguration
): string | undefined {
  return (
    project.sourceRoot ??
    (existsSync(posix.join(project.root, 'src'))
      ? posix.join(project.root, 'src')
      : project.root)
  );
}
