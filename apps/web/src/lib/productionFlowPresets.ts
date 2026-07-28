export type ProductionFlowPreset = {
  key: string;
  name: string;
  processType: string;
  icon: string;
  description: string;
  machineRelevant: boolean;
  labourRelevant: boolean;
};

export const productionFlowPresets: ProductionFlowPreset[] = [
  {
    key: "direct_print",
    name: "Direct print",
    processType: "print",
    icon: "▣",
    description: "Print directly onto the selected sheet or rigid substrate.",
    machineRelevant: true,
    labourRelevant: true
  },
  {
    key: "roll_print",
    name: "Roll print",
    processType: "print",
    icon: "▤",
    description: "Print to vinyl, banner, paper or another roll-fed media.",
    machineRelevant: true,
    labourRelevant: true
  },
  {
    key: "laminate",
    name: "Laminate",
    processType: "laminate",
    icon: "◫",
    description: "Apply protective laminate or overlaminate after printing.",
    machineRelevant: true,
    labourRelevant: true
  },
  {
    key: "trim_cut",
    name: "Trim / cut",
    processType: "cut",
    icon: "✂",
    description: "Trim to finished size, contour cut or cut on a finishing table.",
    machineRelevant: true,
    labourRelevant: true
  },
  {
    key: "mount_apply",
    name: "Mount / apply",
    processType: "mount",
    icon: "▧",
    description: "Apply printed media, vinyl or graphics to the substrate.",
    machineRelevant: true,
    labourRelevant: true
  },
  {
    key: "eyelets",
    name: "Eyelets",
    processType: "finish",
    icon: "⊙",
    description: "Add eyelets or similar finishing hardware.",
    machineRelevant: false,
    labourRelevant: true
  },
  {
    key: "finishing",
    name: "Finishing",
    processType: "finish",
    icon: "◇",
    description: "Any other finishing operation required before packing.",
    machineRelevant: false,
    labourRelevant: true
  },
  {
    key: "pack",
    name: "Pack",
    processType: "pack",
    icon: "□",
    description: "Pack, label and prepare the finished product for dispatch.",
    machineRelevant: false,
    labourRelevant: true
  },
  {
    key: "install",
    name: "Install",
    processType: "install",
    icon: "⌂",
    description: "Install the finished signage or customer-supplied signage on site.",
    machineRelevant: false,
    labourRelevant: true
  }
];

export function normalizeProductionFlowName(value: string): string {
  return value.trim().toLocaleLowerCase("en-AU").replace(/[^a-z0-9]+/g, " ").trim();
}
