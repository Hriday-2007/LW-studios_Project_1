export const STAGES = [
  {
    id: 'approach',
    viewName: 'Approach',
    counter: 'STAGE 01 / 05',
    tag: 'WATERSIDE PAVILION · WINTER',
    telemetry: 'AZ 043° · EL 16°',
    headlineHTML:
      'Quiet <em>timber</em> above the <span class="accent-vermilion">thawless</span> tide',
    description:
      'An atmospheric winter study of a cedar and plaster waterside pavilion, suspended above still midnight water as soft dusk settles into the eaves.',
    cameraPos: [2.46, 1.12, 2.68],
    lookAt: [-0.04, 0.54, 0.02],
    desktopRightOffset: -0.44,
    parallaxScale: 1.0,
  },
  {
    id: 'reflection',
    viewName: 'Reflection',
    counter: 'STAGE 02 / 05',
    tag: 'WATERLINE · RIPPLE STUDY',
    telemetry: 'AZ 322° · EL 05°',
    headlineHTML:
      'Warm <span class="accent-vermilion">lanterns</span> mirrored in <em>slate</em> glass',
    description:
      'Dropped to the waterline, amber shoji and paper lanterns fracture gently across winter ripples beneath cantilevered cedar stilts and landing steps.',
    cameraPos: [-1.96, 0.30, 2.92],
    lookAt: [-0.02, 0.44, 0.02],
    desktopRightOffset: -0.46,
    parallaxScale: 0.72,
  },
  {
    id: 'roofscape',
    viewName: 'Roofscape',
    counter: 'STAGE 03 / 05',
    tag: 'CURVED CERAMIC · EAVES',
    telemetry: 'AZ 308° · EL 27°',
    headlineHTML:
      'Stepped <em>ceramic</em> canopies &amp; <span class="accent-cyan">frost</span> line',
    description:
      'Ascending diagonally across the lean-to wing, lower eave courses, and exposed dark rafters that step upward toward the curved main ridge.',
    cameraPos: [-2.36, 1.98, 1.96],
    lookAt: [-0.02, 0.72, -0.04],
    desktopRightOffset: -0.44,
    parallaxScale: 0.88,
  },
  {
    id: 'planimetry',
    viewName: 'Planimetry',
    counter: 'STAGE 04 / 05',
    tag: 'AXONOMETRIC · FOOTPRINT',
    telemetry: 'AZ 021° · EL 61°',
    headlineHTML:
      'Measured <em>planimetry</em> over <span class="accent-cyan">still</span> depths',
    description:
      'From an elevated near-top-down vantage, the cross-gable entry, boardwalk deck, and shoreline reeds resolve into a crisp architectural diagram.',
    cameraPos: [0.62, 3.12, 1.62],
    lookAt: [-0.02, 0.50, -0.02],
    desktopRightOffset: -0.46,
    parallaxScale: 0.65,
  },
  {
    id: 'synthesis',
    viewName: 'Synthesis',
    counter: 'STAGE 05 / 05',
    tag: 'LW STUDIO · MONOGRAPH',
    telemetry: 'AZ 034° · EL 13°',
    headlineHTML:
      'Architecture <em>composed</em> for <span class="accent-vermilion">winter</span> light',
    description:
      'Overcast blue-hour clarity, restrained interior warmth, and tactile cedar joinery — framed with quiet precision for architectural storytelling.',
    cameraPos: [1.68, 1.02, 2.82],
    lookAt: [-0.02, 0.58, 0.02],
    // Seats building prominently in the right 60% of the desktop viewport leaving left column clear
    desktopRightOffset: -0.54,
    parallaxScale: 0.85,
  },
];

export const STRUCTURE_PARTS = {
  all: {
    label: 'Full Envelope',
    nodePattern: null,
    focus: [-0.02, 0.62, 0.0],
  },
  roof: {
    label: 'Curved Roofscape',
    nodePattern: /(Main_Roof_Group|Stepped sweeping left lean-to tiles|Entry cross-gable curved ceramic roof)/i,
    focus: [-0.12, 1.05, -0.12],
  },
  upper: {
    label: 'Upper Shoji & Balcony',
    nodePattern: /(Upper_House_Group|Balcony_Group)/i,
    focus: [-0.12, 0.78, 0.06],
  },
  entry: {
    label: 'Entry Pavilion & Lanterns',
    nodePattern: /(Entry_Pavilion_Group|Lanterns_Group)/i,
    focus: [0.38, 0.48, 0.16],
  },
  deck: {
    label: 'Boardwalk & Cedar Stilts',
    nodePattern: /(Deck_and_Stairs_Group|Lower_House_Group|Side_Wing_Group)/i,
    focus: [-0.08, 0.24, 0.14],
  },
};
