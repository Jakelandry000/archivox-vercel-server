// renderforge.js

/**
 * 🧱 RenderForge Agent
 * -------------------
 * Purpose: Converts architectural layout JSON into usable AutoCAD scripts (.scr)
 * and preps for optional 3D visualizations (future).
 * 
 * Inputs: layout JSON (same format from PlanWeaver)
 * Output: .scr string + downloadable file logic
 */

function generateAutoCADScript(layout) {
    if (!layout || !layout.rooms || !layout.dimensions) {
      return { error: "Invalid layout data." };
    }
  
    const commands = layout.rooms.map(room => {
      const x1 = room.x;
      const y1 = room.y;
      const x2 = room.x + room.width;
      const y2 = room.y + room.height;
      return `RECTANG ${x1},${y1} ${x2},${y2}`;
    });
  
    return {
      script: commands.join("\n")
    };
  }
  
  function downloadScript(script) {
    const blob = new Blob([script], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "floorplan.scr";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  module.exports = {
    generateAutoCADScript,
    downloadScript
  };
  