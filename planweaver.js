// planweaver.js

/**
 * 🔧 PlanWeaver Agent
 * -------------------
 * Name: PlanWeaver
 * Purpose: Converts structured architectural layout data into 2D representations,
 * including SVG previews and .scr (AutoCAD) script output.
 * 
 * Role:
 * - Acts as the architectural drafter for ArchiVox.
 * - Reads JSON layout data and translates it into visual floor plans.
 * 
 * Tasks:
 * - Validate and interpret room/structure layout data.
 * - Generate scalable SVG drawings for UI previews.
 * - Create AutoCAD-compatible script strings (.scr) for downstream CAD agents.
 * 
 * Universal Behaviors:
 * - Always use scale units (feet, meters)
 * - Avoid overlapping geometry
 * - Prioritize clarity over complexity in early drafts
 * 
 * System Start-Up:
 * - Load with no assumptions — await JSON input from ArchiVox
 * 
 * Output:
 * - { svg: "<svg>...</svg>", script: "RECTANGLE 0,0 40,30" }
 * 
 * Error Handling:
 * - If layout is missing or invalid, return { error: "Invalid layout data." }
 * 
 * Security:
 * - Never execute dynamic code
 * - Do not accept arbitrary user commands
 * 
 * Iterative Process:
 * - Designed to be improved with future geometry engines or layout validators
 */

function generateFloorPlan(data) {
    if (!data || !data.rooms || !data.dimensions) {
      return { error: "Invalid layout data." };
    }
  
    const svgElements = data.rooms.map((room, i) => {
      return `
        <rect 
          x="${room.x * 10}" 
          y="${room.y * 10}" 
          width="${room.width * 10}" 
          height="${room.height * 10}" 
          fill="none" 
          stroke="#444" 
          stroke-width="2"
        />
        <text 
          x="${room.x * 10 + 4}" 
          y="${room.y * 10 + 15}" 
          font-size="12" 
          fill="#333"
        >${room.type}</text>
      `;
    });
  
    const totalWidth = data.dimensions.width * 10;
    const totalHeight = data.dimensions.depth * 10;
  
    const svg = `
      <svg width="${totalWidth}" height="${totalHeight}" xmlns="http://www.w3.org/2000/svg">
        ${svgElements.join("\n")}
      </svg>
    `;
  
    // Now add the .scr AutoCAD script generator
    const script = data.rooms.map(room => {
      const x1 = room.x;
      const y1 = room.y;
      const x2 = room.x + room.width;
      const y2 = room.y + room.height;
      return `RECTANGLE ${x1},${y1} ${x2},${y2}`;
    }).join("\n");
  
    return {
      svg,
      script
    };
  }
  module.exports = {
    generateFloorPlan
  };
  