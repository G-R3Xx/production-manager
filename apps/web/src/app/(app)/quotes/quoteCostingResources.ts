export type QuoteCostingProcess = {
  id: string;
  name: string;
  department: string;
  processType: string;
  labourOperationId: string | null;
};

export type QuoteCostingMachine = {
  id: string;
  name: string;
  machineType: string;
  maxWidthMm: string | null;
  speedValue: string;
  speedUom: string;
  hourlyCost: string;
  setupMinutes: string;
  inkCostPerSqm: string;
  colourImpressionCost: string;
  monoImpressionCost: string;
  processIds: string[];
};

export type QuoteCostingLabour = {
  id: string;
  name: string;
  department: string;
  hourlyRate: string;
  calculationBasis: string;
  calculationValue: string;
  minimumMinutes: string;
};

export type QuoteCostingRecipeStep = {
  processId: string;
  machineId: string | null;
  labourOperationId: string | null;
};

export type QuoteCostingRecipe = {
  id: string;
  materialId: string | null;
  processIds: string[];
  processSteps: QuoteCostingRecipeStep[];
};

export type QuoteCostingResources = {
  processes: QuoteCostingProcess[];
  machines: QuoteCostingMachine[];
  labour: QuoteCostingLabour[];
  recipes: QuoteCostingRecipe[];
};

export type MachineCostMetrics = {
  quantity: number;
  areaSqmPerUnit: number;
  sheetsPerLine?: number;
  linearMetresPerLine?: number;
  requiredWidthMm?: number;
  sides?: number;
  a4FacesPerParentSheet?: number;
};

export type MachineCostSelection = {
  machine: QuoteCostingMachine | null;
  process: QuoteCostingProcess | null;
  machineCostPerUnit: number;
  lineMachineCost: number;
  inkRatePerSqm: number;
  incompatibleMachines: QuoteCostingMachine[];
};

function n(value: string | number | null | undefined, fallback = 0): number {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCostingName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/jingwei/g, "jewei")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function departmentMatches(processDepartment: string, requestedDepartment?: string | null): boolean {
  if (!requestedDepartment) return true;
  const process = normalizeCostingName(processDepartment).replace(/ /g, "_");
  const requested = normalizeCostingName(requestedDepartment).replace(/ /g, "_");
  return process === requested || process === "general" || process === "shared";
}

export function matchingProcesses(
  resources: QuoteCostingResources | undefined,
  aliases: string[],
  department?: string | null
): QuoteCostingProcess[] {
  if (!resources) return [];
  const normalizedAliases = aliases.map(normalizeCostingName).filter(Boolean);
  return resources.processes.filter((process) => {
    if (!departmentMatches(process.department, department)) return false;
    const name = normalizeCostingName(process.name);
    return normalizedAliases.some((alias) => name === alias || name.includes(alias) || alias.includes(name));
  });
}

function machineFitsWidth(machine: QuoteCostingMachine, requiredWidthMm: number): boolean {
  const max = n(machine.maxWidthMm, 0);
  return max <= 0 || requiredWidthMm <= 0 || requiredWidthMm <= max + 0.0001;
}

function speedAmountFor(machine: QuoteCostingMachine, metrics: MachineCostMetrics): number {
  const quantity = Math.max(1, metrics.quantity || 1);
  if (machine.speedUom === "linear_metres_per_hour") {
    return Math.max(0, metrics.linearMetresPerLine ?? 0);
  }
  if (machine.speedUom === "sheets_per_hour") {
    return Math.max(0, metrics.sheetsPerLine ?? quantity);
  }
  return Math.max(0, metrics.areaSqmPerUnit) * quantity;
}

function lineMachineCost(machine: QuoteCostingMachine, metrics: MachineCostMetrics): number {
  const speed = Math.max(0, n(machine.speedValue, 0));
  const hourly = Math.max(0, n(machine.hourlyCost, 0));
  const setupHours = Math.max(0, n(machine.setupMinutes, 0)) / 60;
  let runHours = 0;
  if (speed > 0 && machine.speedUom === "a4_faces_per_minute") {
    const sheets = Math.max(0, metrics.sheetsPerLine ?? metrics.quantity ?? 0);
    const sides = Math.max(1, metrics.sides ?? 1);
    const facesPerParentSheet = Math.max(0.1, metrics.a4FacesPerParentSheet ?? 2);
    runHours = (sheets * sides * facesPerParentSheet) / speed / 60;
  } else {
    const runAmount = speedAmountFor(machine, metrics);
    runHours = speed > 0 ? runAmount / speed : 0;
  }
  return (setupHours + runHours) * hourly;
}

export function selectMachineForProcess(
  resources: QuoteCostingResources | undefined,
  aliases: string[],
  metrics: MachineCostMetrics,
  department?: string | null,
  explicitMachineId?: string | null,
  explicitProcessId?: string | null
): MachineCostSelection {
  if (!resources) {
    return { machine: null, process: null, machineCostPerUnit: 0, lineMachineCost: 0, inkRatePerSqm: 0, incompatibleMachines: [] };
  }

  const processes = explicitProcessId
    ? resources.processes.filter((process) => process.id === explicitProcessId)
    : matchingProcesses(resources, aliases, department);
  const processIds = new Set(processes.map((process) => process.id));
  const candidates = explicitMachineId
    ? resources.machines.filter((machine) => machine.id === explicitMachineId)
    : resources.machines.filter((machine) => machine.processIds.some((id) => processIds.has(id)));
  const requiredWidthMm = Math.max(0, metrics.requiredWidthMm ?? 0);
  const compatible = candidates.filter((machine) => machineFitsWidth(machine, requiredWidthMm));
  const incompatibleMachines = candidates.filter((machine) => !machineFitsWidth(machine, requiredWidthMm));
  const selected = [...compatible].sort((a, b) => lineMachineCost(a, metrics) - lineMachineCost(b, metrics))[0] ?? null;
  const lineCost = selected ? lineMachineCost(selected, metrics) : 0;
  const quantity = Math.max(1, metrics.quantity || 1);
  const process = selected
    ? processes.find((row) => selected.processIds.includes(row.id)) ?? processes[0] ?? null
    : processes[0] ?? null;

  return {
    machine: selected,
    process,
    machineCostPerUnit: lineCost / quantity,
    lineMachineCost: lineCost,
    inkRatePerSqm: selected ? Math.max(0, n(selected.inkCostPerSqm, 0)) : 0,
    incompatibleMachines
  };
}

export function labourForProcess(
  resources: QuoteCostingResources | undefined,
  aliases: string[],
  department?: string | null,
  explicitLabourId?: string | null,
  explicitProcessId?: string | null
): QuoteCostingLabour | null {
  if (!resources) return null;
  if (explicitLabourId) return resources.labour.find((row) => row.id === explicitLabourId) ?? null;
  const process = explicitProcessId
    ? resources.processes.find((row) => row.id === explicitProcessId) ?? null
    : matchingProcesses(resources, aliases, department)[0] ?? null;
  if (!process?.labourOperationId) return null;
  return resources.labour.find((row) => row.id === process.labourOperationId) ?? null;
}

export function labourRateForProcess(
  resources: QuoteCostingResources | undefined,
  aliases: string[],
  department: string | null | undefined,
  fallback: number
): number {
  const labour = labourForProcess(resources, aliases, department);
  const rate = labour ? n(labour.hourlyRate, 0) : 0;
  return rate > 0 ? rate : fallback;
}

export function labourLineCost(
  labour: QuoteCostingLabour | null,
  metrics: MachineCostMetrics
): number {
  if (!labour) return 0;
  const value = Math.max(0, n(labour.calculationValue, 0));
  const quantity = Math.max(1, metrics.quantity || 1);
  const areaLine = Math.max(0, metrics.areaSqmPerUnit) * quantity;
  const sheets = Math.max(0, metrics.sheetsPerLine ?? 0);
  const linearMetres = Math.max(0, metrics.linearMetresPerLine ?? 0);
  let hours = 0;
  if (labour.calculationBasis === "per_sqm_hours") hours = areaLine * value;
  else if (labour.calculationBasis === "per_sheet_hours") hours = sheets * value;
  else if (labour.calculationBasis === "per_linear_metre_hours") hours = linearMetres * value;
  else if (labour.calculationBasis === "per_item_hours") hours = quantity * value;
  else hours = value / 60;
  hours = Math.max(hours, Math.max(0, n(labour.minimumMinutes, 0)) / 60);
  return hours * Math.max(0, n(labour.hourlyRate, 0));
}

export function recipeForId(resources: QuoteCostingResources | undefined, recipeId: string | null | undefined): QuoteCostingRecipe | null {
  if (!resources || !recipeId) return null;
  return resources.recipes.find((recipe) => recipe.id === recipeId) ?? null;
}
