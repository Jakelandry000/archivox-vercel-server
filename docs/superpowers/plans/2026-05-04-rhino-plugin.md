# Rhino Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dockable AI chat panel that installs into Rhino 8 and generates 3D architectural geometry from plain-English commands via Claude API + RhinoCommon.

**Architecture:** A C# .NET 7 Rhino plugin registers a dockable Eto.Forms panel. When the user types a command, the panel POSTs to Claude API with a structured system prompt; Claude returns a JSON geometry spec; GeometryBuilder executes it against the active RhinoDoc using RhinoCommon primitives.

**Tech Stack:** C# .NET 7, RhinoCommon (Rhino 8 SDK), Eto.Forms, Grasshopper API, Claude API (claude-sonnet-4-6 via HTTP), MSBuild, Visual Studio 2022 / Rider

---

## File Map

```
archivox-rhino-plugin/
├── ArchiVox.RhinoPlugin.sln
├── src/
│   ├── ArchiVox.RhinoPlugin.csproj
│   ├── Plugin.cs                        # PlugIn entry point, registers panel + command
│   ├── Commands/
│   │   └── OpenPanelCommand.cs          # `ArchiVoxOpen` Rhino command
│   ├── UI/
│   │   ├── ChatPanel.cs                 # Panel host registered with Rhino.UI.Panels
│   │   └── ChatPanelControl.cs          # Eto.Forms UI: message list + input + send
│   ├── Services/
│   │   ├── ClaudeClient.cs              # HttpClient wrapper for Claude API
│   │   └── GeometryBuilder.cs           # JSON command → RhinoCommon geometry
│   └── Models/
│       ├── ChatMessage.cs               # { Role, Content }
│       └── GeometryCommand.cs           # Deserialized Claude response
└── tests/
    ├── ArchiVox.RhinoPlugin.Tests.csproj
    ├── ClaudeClientTests.cs             # Mocked HTTP tests for request/response shape
    └── GeometryBuilderTests.cs          # Pure geometry logic (no Rhino runtime needed)
```

---

## Prerequisites

1. Install **Rhino 8** for Windows (free evaluation works): https://www.rhino3d.com/download/
2. Install **Visual Studio 2022** (Community is free) with ".NET desktop development" workload
3. Have an **Anthropic API key** ready
4. Rhino 8 installs to `C:\Program Files\Rhino 8\` — note this path, you'll reference DLLs from it

---

## Task 1: Project Scaffold

**Files:**
- Create: `archivox-rhino-plugin/ArchiVox.RhinoPlugin.sln`
- Create: `archivox-rhino-plugin/src/ArchiVox.RhinoPlugin.csproj`
- Create: `archivox-rhino-plugin/tests/ArchiVox.RhinoPlugin.Tests.csproj`

- [ ] **Step 1: Create solution and project directories**

```bash
mkdir -p archivox-rhino-plugin/src
mkdir -p archivox-rhino-plugin/tests
cd archivox-rhino-plugin
dotnet new sln -n ArchiVox.RhinoPlugin
```

- [ ] **Step 2: Create the plugin project**

Create `src/ArchiVox.RhinoPlugin.csproj` manually (do NOT use `dotnet new classlib` — Rhino plugins need specific targets):

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net7.0-windows</TargetFramework>
    <Nullable>enable</Nullable>
    <RootNamespace>ArchiVox.RhinoPlugin</RootNamespace>
    <AssemblyName>ArchiVox.RhinoPlugin</AssemblyName>
    <!-- Rhino loads .rhp files — this post-build step renames the output -->
    <PostBuildEvent>copy "$(TargetPath)" "$(TargetDir)$(AssemblyName).rhp"</PostBuildEvent>
  </PropertyGroup>

  <ItemGroup>
    <!-- Reference RhinoCommon and Eto from your local Rhino 8 installation -->
    <Reference Include="RhinoCommon">
      <HintPath>C:\Program Files\Rhino 8\System\RhinoCommon.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="Eto">
      <HintPath>C:\Program Files\Rhino 8\System\Eto.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="Rhino.UI">
      <HintPath>C:\Program Files\Rhino 8\System\Rhino.UI.dll</HintPath>
      <Private>false</Private>
    </Reference>
    <Reference Include="Grasshopper">
      <HintPath>C:\Program Files\Rhino 8\Plug-ins\Grasshopper\Grasshopper.dll</HintPath>
      <Private>false</Private>
    </Reference>
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="System.Text.Json" Version="8.0.0" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Create the test project**

```bash
cd tests
dotnet new xunit -n ArchiVox.RhinoPlugin.Tests --framework net7.0-windows
```

Edit `tests/ArchiVox.RhinoPlugin.Tests.csproj` to add reference to the plugin project and Moq:

```xml
<ItemGroup>
  <ProjectReference Include="..\src\ArchiVox.RhinoPlugin.csproj" />
  <PackageReference Include="Moq" Version="4.20.70" />
  <PackageReference Include="FluentAssertions" Version="6.12.0" />
</ItemGroup>
```

- [ ] **Step 4: Add both projects to the solution**

```bash
cd ..
dotnet sln add src/ArchiVox.RhinoPlugin.csproj
dotnet sln add tests/ArchiVox.RhinoPlugin.Tests.csproj
```

- [ ] **Step 5: Verify solution builds**

```bash
dotnet build
```

Expected: `Build succeeded. 0 Error(s)`

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Rhino plugin solution and test project"
```

---

## Task 2: Models

**Files:**
- Create: `src/Models/ChatMessage.cs`
- Create: `src/Models/GeometryCommand.cs`

- [ ] **Step 1: Write failing tests for model deserialization**

Create `tests/GeometryCommandTests.cs`:

```csharp
using System.Text.Json;
using ArchiVox.RhinoPlugin.Models;
using FluentAssertions;

namespace ArchiVox.RhinoPlugin.Tests;

public class GeometryCommandTests
{
    [Fact]
    public void Deserialize_StaircaseCommand_ParsesAllFields()
    {
        var json = """
        {
          "commands": [
            {
              "type": "staircase",
              "params": {
                "steps": 12,
                "riser_height_mm": 175.0,
                "tread_depth_mm": 275.0,
                "width_mm": 1200.0,
                "origin_x": 0.0,
                "origin_y": 0.0,
                "origin_z": 0.0
              }
            }
          ]
        }
        """;

        var result = JsonSerializer.Deserialize<ClaudeGeometryResponse>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        result.Should().NotBeNull();
        result!.Commands.Should().HaveCount(1);
        result.Commands[0].Type.Should().Be("staircase");
        result.Commands[0].Params["steps"].GetDouble().Should().Be(12);
    }

    [Fact]
    public void Deserialize_WallCommand_ParsesAllFields()
    {
        var json = """
        {
          "commands": [
            {
              "type": "wall",
              "params": {
                "start_x": 0.0, "start_y": 0.0, "start_z": 0.0,
                "end_x": 5000.0, "end_y": 0.0, "end_z": 0.0,
                "height_mm": 2700.0,
                "thickness_mm": 200.0
              }
            }
          ]
        }
        """;

        var result = JsonSerializer.Deserialize<ClaudeGeometryResponse>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        result!.Commands[0].Type.Should().Be("wall");
        result.Commands[0].Params["height_mm"].GetDouble().Should().Be(2700.0);
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
dotnet test tests/ --filter "GeometryCommandTests"
```

Expected: FAIL — `ClaudeGeometryResponse` not defined

- [ ] **Step 3: Create model classes**

Create `src/Models/GeometryCommand.cs`:

```csharp
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ArchiVox.RhinoPlugin.Models;

public class ClaudeGeometryResponse
{
    [JsonPropertyName("commands")]
    public List<GeometryCommand> Commands { get; set; } = new();
}

public class GeometryCommand
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("params")]
    public Dictionary<string, JsonElement> Params { get; set; } = new();
}
```

Create `src/Models/ChatMessage.cs`:

```csharp
namespace ArchiVox.RhinoPlugin.Models;

public record ChatMessage(string Role, string Content);
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
dotnet test tests/ --filter "GeometryCommandTests"
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/Models/ tests/GeometryCommandTests.cs
git commit -m "feat: add GeometryCommand and ChatMessage models with tests"
```

---

## Task 3: Claude API Client

**Files:**
- Create: `src/Services/ClaudeClient.cs`
- Create: `tests/ClaudeClientTests.cs`

- [ ] **Step 1: Write failing tests**

Create `tests/ClaudeClientTests.cs`:

```csharp
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ArchiVox.RhinoPlugin.Models;
using ArchiVox.RhinoPlugin.Services;
using FluentAssertions;
using Moq;
using Moq.Protected;

namespace ArchiVox.RhinoPlugin.Tests;

public class ClaudeClientTests
{
    private static HttpClient MakeClient(string responseBody)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(responseBody)
            });
        return new HttpClient(handler.Object);
    }

    [Fact]
    public async Task SendCommand_ParsesGeometryCommandsFromResponse()
    {
        // Claude API wraps the content in its standard response shape
        var claudeResponse = """
        {
          "content": [
            {
              "type": "text",
              "text": "{\"commands\":[{\"type\":\"staircase\",\"params\":{\"steps\":12,\"riser_height_mm\":175,\"tread_depth_mm\":275,\"width_mm\":1200,\"origin_x\":0,\"origin_y\":0,\"origin_z\":0}}]}"
            }
          ]
        }
        """;

        var client = new ClaudeClient(MakeClient(claudeResponse), "test-api-key");
        var result = await client.SendCommandAsync("add a 12-step staircase");

        result.Should().NotBeNull();
        result!.Commands.Should().HaveCount(1);
        result.Commands[0].Type.Should().Be("staircase");
    }

    [Fact]
    public async Task SendCommand_ReturnsNull_WhenResponseIsNotJson()
    {
        var claudeResponse = """
        {
          "content": [{ "type": "text", "text": "I cannot generate geometry for that request." }]
        }
        """;

        var client = new ClaudeClient(MakeClient(claudeResponse), "test-api-key");
        var result = await client.SendCommandAsync("tell me a joke");

        result.Should().BeNull();
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
dotnet test tests/ --filter "ClaudeClientTests"
```

Expected: FAIL — `ClaudeClient` not defined

- [ ] **Step 3: Implement ClaudeClient**

Create `src/Services/ClaudeClient.cs`:

```csharp
using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using ArchiVox.RhinoPlugin.Models;

namespace ArchiVox.RhinoPlugin.Services;

public class ClaudeClient
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private const string ApiUrl = "https://api.anthropic.com/v1/messages";
    private const string Model = "claude-sonnet-4-6";

    private const string SystemPrompt = """
        You are an architectural geometry assistant embedded in Rhino 8.
        When the user describes an architectural element, respond ONLY with a JSON object in this exact format:
        {"commands":[{"type":"<type>","params":{<params>}}]}

        Supported types and their required params:
        - staircase: steps(int), riser_height_mm(float), tread_depth_mm(float), width_mm(float), origin_x(float), origin_y(float), origin_z(float)
        - wall: start_x, start_y, start_z, end_x, end_y, end_z, height_mm(float), thickness_mm(float)
        - window: insert_x, insert_y, insert_z, width_mm(float), height_mm(float), sill_height_mm(float)
        - door: insert_x, insert_y, insert_z, width_mm(float), height_mm(float)
        - column: base_x, base_y, base_z, height_mm(float), width_mm(float), depth_mm(float)
        - slab: corner_x, corner_y, corner_z, length_x_mm(float), length_y_mm(float), thickness_mm(float)

        All dimensions are in millimetres. Use 0,0,0 as origin unless the user specifies a location.
        If you cannot produce geometry, respond with {"commands":[]}.
        Never include explanation text outside the JSON.
        """;

    public ClaudeClient(HttpClient http, string apiKey)
    {
        _http = http;
        _apiKey = apiKey;
    }

    public async Task<ClaudeGeometryResponse?> SendCommandAsync(string userMessage)
    {
        var body = JsonSerializer.Serialize(new
        {
            model = Model,
            max_tokens = 1024,
            system = SystemPrompt,
            messages = new[] { new { role = "user", content = userMessage } }
        });

        var request = new HttpRequestMessage(HttpMethod.Post, ApiUrl)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("x-api-key", _apiKey);
        request.Headers.Add("anthropic-version", "2023-06-01");

        var response = await _http.SendAsync(request);
        var responseJson = await response.Content.ReadAsStringAsync();

        var doc = JsonNode.Parse(responseJson);
        var text = doc?["content"]?[0]?["text"]?.GetValue<string>();

        if (string.IsNullOrWhiteSpace(text)) return null;

        try
        {
            return JsonSerializer.Deserialize<ClaudeGeometryResponse>(text,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
dotnet test tests/ --filter "ClaudeClientTests"
```

Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/Services/ClaudeClient.cs tests/ClaudeClientTests.cs
git commit -m "feat: Claude API client with geometry command parsing"
```

---

## Task 4: Geometry Builder

**Files:**
- Create: `src/Services/GeometryBuilder.cs`
- Create: `tests/GeometryBuilderTests.cs`

Note: GeometryBuilder creates RhinoCommon objects in memory — these tests validate the geometry math without needing a running Rhino instance.

- [ ] **Step 1: Write failing tests**

Create `tests/GeometryBuilderTests.cs`:

```csharp
using System.Collections.Generic;
using System.Text.Json;
using ArchiVox.RhinoPlugin.Models;
using ArchiVox.RhinoPlugin.Services;
using FluentAssertions;
using Rhino.Geometry;

namespace ArchiVox.RhinoPlugin.Tests;

public class GeometryBuilderTests
{
    private static GeometryCommand MakeCommand(string type, object paramsObj)
    {
        var json = JsonSerializer.Serialize(paramsObj);
        var dict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;
        return new GeometryCommand { Type = type, Params = dict };
    }

    [Fact]
    public void BuildStaircase_Returns12Breps_For12Steps()
    {
        var cmd = MakeCommand("staircase", new
        {
            steps = 12,
            riser_height_mm = 175.0,
            tread_depth_mm = 275.0,
            width_mm = 1200.0,
            origin_x = 0.0,
            origin_y = 0.0,
            origin_z = 0.0
        });

        var result = GeometryBuilder.Build(cmd);

        result.Should().HaveCount(12);
        result.Should().AllSatisfy(b => b.Should().BeOfType<Brep>());
    }

    [Fact]
    public void BuildWall_ReturnsSingleBrep()
    {
        var cmd = MakeCommand("wall", new
        {
            start_x = 0.0, start_y = 0.0, start_z = 0.0,
            end_x = 5000.0, end_y = 0.0, end_z = 0.0,
            height_mm = 2700.0,
            thickness_mm = 200.0
        });

        var result = GeometryBuilder.Build(cmd);

        result.Should().HaveCount(1);
        result[0].Should().BeOfType<Brep>();
    }

    [Fact]
    public void Build_UnknownType_ReturnsEmptyList()
    {
        var cmd = MakeCommand("unknown_type", new { });
        var result = GeometryBuilder.Build(cmd);
        result.Should().BeEmpty();
    }
}
```

- [ ] **Step 2: Run to confirm failure**

```bash
dotnet test tests/ --filter "GeometryBuilderTests"
```

Expected: FAIL — `GeometryBuilder` not defined

- [ ] **Step 3: Implement GeometryBuilder**

Create `src/Services/GeometryBuilder.cs`:

```csharp
using System;
using System.Collections.Generic;
using System.Text.Json;
using ArchiVox.RhinoPlugin.Models;
using Rhino.Geometry;

namespace ArchiVox.RhinoPlugin.Services;

public static class GeometryBuilder
{
    public static List<GeometryBase> Build(GeometryCommand cmd) => cmd.Type switch
    {
        "staircase" => BuildStaircase(cmd.Params),
        "wall"      => BuildWall(cmd.Params),
        "window"    => BuildBox(cmd.Params, "window"),
        "door"      => BuildBox(cmd.Params, "door"),
        "column"    => BuildColumn(cmd.Params),
        "slab"      => BuildSlab(cmd.Params),
        _           => new List<GeometryBase>()
    };

    private static double P(Dictionary<string, JsonElement> p, string key, double fallback = 0.0)
        => p.TryGetValue(key, out var v) ? v.GetDouble() : fallback;

    private static List<GeometryBase> BuildStaircase(Dictionary<string, JsonElement> p)
    {
        var result = new List<GeometryBase>();
        int steps   = (int)P(p, "steps", 1);
        double riser = P(p, "riser_height_mm", 175);
        double tread = P(p, "tread_depth_mm", 275);
        double width = P(p, "width_mm", 1200);
        double ox = P(p, "origin_x"), oy = P(p, "origin_y"), oz = P(p, "origin_z");

        for (int i = 0; i < steps; i++)
        {
            var corner = new Point3d(ox + i * tread, oy, oz + i * riser);
            var box = new Box(
                new Plane(corner, Vector3d.XAxis, Vector3d.YAxis),
                new Interval(0, tread),
                new Interval(0, width),
                new Interval(0, riser)
            );
            result.Add(box.ToBrep());
        }
        return result;
    }

    private static List<GeometryBase> BuildWall(Dictionary<string, JsonElement> p)
    {
        var start  = new Point3d(P(p, "start_x"), P(p, "start_y"), P(p, "start_z"));
        var end    = new Point3d(P(p, "end_x"),   P(p, "end_y"),   P(p, "end_z"));
        double h   = P(p, "height_mm", 2700);
        double t   = P(p, "thickness_mm", 200);

        var dir    = end - start;
        var normal = Vector3d.CrossProduct(dir, Vector3d.ZAxis);
        normal.Unitize();

        var plane  = new Plane(start, dir, Vector3d.ZAxis);
        var box    = new Box(plane,
            new Interval(0, dir.Length),
            new Interval(-t / 2, t / 2),
            new Interval(0, h));

        return new List<GeometryBase> { box.ToBrep() };
    }

    private static List<GeometryBase> BuildColumn(Dictionary<string, JsonElement> p)
    {
        var origin = new Point3d(P(p, "base_x"), P(p, "base_y"), P(p, "base_z"));
        var box    = new Box(
            new Plane(origin, Vector3d.XAxis, Vector3d.YAxis),
            new Interval(-P(p, "width_mm", 300) / 2, P(p, "width_mm", 300) / 2),
            new Interval(-P(p, "depth_mm", 300) / 2, P(p, "depth_mm", 300) / 2),
            new Interval(0, P(p, "height_mm", 2700)));
        return new List<GeometryBase> { box.ToBrep() };
    }

    private static List<GeometryBase> BuildSlab(Dictionary<string, JsonElement> p)
    {
        var origin = new Point3d(P(p, "corner_x"), P(p, "corner_y"), P(p, "corner_z"));
        var box    = new Box(
            new Plane(origin, Vector3d.XAxis, Vector3d.YAxis),
            new Interval(0, P(p, "length_x_mm", 5000)),
            new Interval(0, P(p, "length_y_mm", 4000)),
            new Interval(0, P(p, "thickness_mm", 200)));
        return new List<GeometryBase> { box.ToBrep() };
    }

    private static List<GeometryBase> BuildBox(Dictionary<string, JsonElement> p, string _)
    {
        var origin = new Point3d(P(p, "insert_x"), P(p, "insert_y"), P(p, "insert_z"));
        double sill = p.ContainsKey("sill_height_mm") ? P(p, "sill_height_mm") : 0;
        var box = new Box(
            new Plane(new Point3d(origin.X, origin.Y, origin.Z + sill), Vector3d.XAxis, Vector3d.YAxis),
            new Interval(0, P(p, "width_mm", 1000)),
            new Interval(0, 100),
            new Interval(0, P(p, "height_mm", 2100)));
        return new List<GeometryBase> { box.ToBrep() };
    }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
dotnet test tests/ --filter "GeometryBuilderTests"
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/Services/GeometryBuilder.cs tests/GeometryBuilderTests.cs
git commit -m "feat: geometry builder for staircase, wall, column, slab, door, window"
```

---

## Task 5: Plugin Entry Point + Command

**Files:**
- Create: `src/Plugin.cs`
- Create: `src/Commands/OpenPanelCommand.cs`

No unit tests for these — they require the Rhino runtime. Manual testing in Task 7.

- [ ] **Step 1: Create Plugin.cs**

```csharp
using System;
using Rhino;
using Rhino.PlugIns;

namespace ArchiVox.RhinoPlugin;

public class ArchiVoxPlugin : PlugIn
{
    public static ArchiVoxPlugin Instance { get; private set; } = null!;

    public ArchiVoxPlugin()
    {
        Instance = this;
    }

    protected override LoadReturnCode OnLoad(ref string errorMessage)
    {
        Rhino.UI.Panels.RegisterPanel(
            this,
            typeof(UI.ChatPanel),
            "ArchiVox",
            System.Drawing.SystemIcons.Application.ToBitmap());

        return LoadReturnCode.Success;
    }
}
```

- [ ] **Step 2: Create OpenPanelCommand.cs**

```csharp
using Rhino;
using Rhino.Commands;
using Rhino.UI;

namespace ArchiVox.RhinoPlugin.Commands;

public class OpenPanelCommand : Command
{
    public override string EnglishName => "ArchiVoxOpen";

    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        Panels.OpenPanel(typeof(UI.ChatPanel).GUID);
        return Result.Success;
    }
}
```

- [ ] **Step 3: Build to verify no compile errors**

```bash
dotnet build src/
```

Expected: `Build succeeded. 0 Error(s)` (ChatPanel not yet defined — add a stub)

Create stub `src/UI/ChatPanel.cs` to unblock build:

```csharp
using Eto.Forms;
using Rhino.UI;

namespace ArchiVox.RhinoPlugin.UI;

[System.Runtime.InteropServices.Guid("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")]
public class ChatPanel : Panel, IPanel
{
    public ChatPanel() { }
    public void PanelShown(uint documentSerialNumber, ShowPanelReason reason) { }
    public void PanelHidden(uint documentSerialNumber, ShowPanelReason reason) { }
    public void PanelClosing(uint documentSerialNumber, bool onCloseDocument) { }
}
```

```bash
dotnet build src/
```

Expected: `Build succeeded`

- [ ] **Step 4: Commit**

```bash
git add src/Plugin.cs src/Commands/OpenPanelCommand.cs src/UI/ChatPanel.cs
git commit -m "feat: plugin entry point, ArchiVoxOpen command, ChatPanel stub"
```

---

## Task 6: Chat Panel UI

**Files:**
- Modify: `src/UI/ChatPanel.cs` (replace stub with full implementation)
- Create: `src/UI/ChatPanelControl.cs`

- [ ] **Step 1: Create ChatPanelControl.cs (the Eto.Forms UI)**

```csharp
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Eto.Drawing;
using Eto.Forms;
using ArchiVox.RhinoPlugin.Models;
using ArchiVox.RhinoPlugin.Services;
using Rhino;

namespace ArchiVox.RhinoPlugin.UI;

public class ChatPanelControl : Panel
{
    private readonly TextArea _messageArea;
    private readonly TextBox _inputBox;
    private readonly Button _sendButton;
    private readonly ClaudeClient _claude;
    private readonly List<ChatMessage> _history = new();

    public ChatPanelControl()
    {
        var apiKey = Environment.GetEnvironmentVariable("ARCHIVOX_API_KEY") ?? string.Empty;
        _claude = new ClaudeClient(new System.Net.Http.HttpClient(), apiKey);

        _messageArea = new TextArea
        {
            ReadOnly = true,
            Wrap = true,
            BackgroundColor = Color.FromArgb(18, 18, 18),
            TextColor = Colors.White,
            Font = new Font("Consolas", 11)
        };

        _inputBox = new TextBox
        {
            PlaceholderText = "e.g. add a 12-step staircase, 175mm rise",
            BackgroundColor = Color.FromArgb(30, 30, 30),
            TextColor = Colors.White
        };
        _inputBox.KeyDown += (s, e) =>
        {
            if (e.Key == Keys.Enter) _ = SendAsync();
        };

        _sendButton = new Button { Text = "Generate →" };
        _sendButton.Click += (s, e) => _ = SendAsync();

        Content = new TableLayout
        {
            Padding = new Padding(8),
            Spacing = new Size(4, 4),
            Rows =
            {
                new TableRow(_messageArea) { ScaleHeight = true },
                new TableRow(new TableLayout
                {
                    Rows = { new TableRow(new TableCell(_inputBox, true), _sendButton) }
                })
            }
        };

        AppendMessage("ArchiVox", "Ready. Describe any architectural element.");
    }

    private async Task SendAsync()
    {
        var text = _inputBox.Text.Trim();
        if (string.IsNullOrEmpty(text)) return;

        _inputBox.Text = string.Empty;
        _sendButton.Enabled = false;
        AppendMessage("You", text);
        AppendMessage("ArchiVox", "Generating…");

        try
        {
            var response = await _claude.SendCommandAsync(text);

            if (response == null || response.Commands.Count == 0)
            {
                UpdateLastMessage("ArchiVox", "No geometry could be generated for that request.");
                return;
            }

            var doc = RhinoDoc.ActiveDoc;
            int added = 0;
            foreach (var cmd in response.Commands)
            {
                var objects = GeometryBuilder.Build(cmd);
                foreach (var obj in objects)
                {
                    doc.Objects.Add(obj);
                    added++;
                }
            }

            doc.Views.Redraw();
            UpdateLastMessage("ArchiVox", $"Added {added} object(s) to the model.");
        }
        catch (Exception ex)
        {
            UpdateLastMessage("ArchiVox", $"Error: {ex.Message}");
        }
        finally
        {
            _sendButton.Enabled = true;
        }
    }

    private void AppendMessage(string sender, string text)
    {
        _messageArea.Text += $"\n[{sender}] {text}";
    }

    private void UpdateLastMessage(string sender, string text)
    {
        var lines = _messageArea.Text.Split('\n');
        lines[^1] = $"[{sender}] {text}";
        _messageArea.Text = string.Join('\n', lines);
    }
}
```

- [ ] **Step 2: Replace ChatPanel stub with full panel**

Replace the contents of `src/UI/ChatPanel.cs`:

```csharp
using Eto.Forms;
using Rhino.UI;

namespace ArchiVox.RhinoPlugin.UI;

[System.Runtime.InteropServices.Guid("A1B2C3D4-E5F6-7890-ABCD-EF1234567890")]
public class ChatPanel : Panel, IPanel
{
    private readonly ChatPanelControl _control;

    public ChatPanel()
    {
        _control = new ChatPanelControl();
        Content = _control;
    }

    public void PanelShown(uint documentSerialNumber, ShowPanelReason reason) { }
    public void PanelHidden(uint documentSerialNumber, ShowPanelReason reason) { }
    public void PanelClosing(uint documentSerialNumber, bool onCloseDocument) { }
}
```

- [ ] **Step 3: Build**

```bash
dotnet build src/
```

Expected: `Build succeeded`

- [ ] **Step 4: Commit**

```bash
git add src/UI/
git commit -m "feat: Eto.Forms chat panel UI with message history and send input"
```

---

## Task 7: Install and Manual Test in Rhino

No automated tests — this requires Rhino running.

- [ ] **Step 1: Build in Release mode**

```bash
dotnet build src/ -c Release
```

The post-build step copies the output to a `.rhp` file in `src/bin/Release/net7.0-windows/`.

- [ ] **Step 2: Set the ARCHIVOX_API_KEY environment variable**

```powershell
$env:ARCHIVOX_API_KEY = "sk-ant-your-key-here"
```

Or set it permanently in Windows System Properties → Environment Variables.

- [ ] **Step 3: Install the plugin in Rhino**

1. Open Rhino 8
2. Type `PlugInManager` in the Rhino command line → press Enter
3. Click "Install…"
4. Navigate to `src/bin/Release/net7.0-windows/ArchiVox.RhinoPlugin.rhp`
5. Click Open → confirm install

- [ ] **Step 4: Open the panel**

In Rhino command line, type: `ArchiVoxOpen` → press Enter

Expected: ArchiVox panel docks on the side showing "Ready. Describe any architectural element."

- [ ] **Step 5: Test staircase generation**

In the chat input, type: `add a 10-step staircase, 175mm rise, 275mm tread, 1200mm wide`

Expected:
- Panel shows "[ArchiVox] Added 10 object(s) to the model."
- 10 tread boxes appear in the Rhino viewport

- [ ] **Step 6: Test wall generation**

Type: `add a wall 5 metres long, 2700mm tall, 200mm thick`

Expected: Single wall box appears in viewport

- [ ] **Step 7: Commit final state**

```bash
git add .
git commit -m "feat: Rhino plugin complete — chat panel generates geometry via Claude API"
```

---

## Task 8: Plugin Download Page (ArchiVox Website)

**Files:**
- Create: `apps/web/src/app/plugin/page.tsx` (in the main ArchiVox Next.js repo)
- Create: `apps/web/public/downloads/` (place built .rhp here for download)

- [ ] **Step 1: Copy the built .rhp to the web app's public folder**

```bash
mkdir -p apps/web/public/downloads
cp archivox-rhino-plugin/src/bin/Release/net7.0-windows/ArchiVox.RhinoPlugin.rhp \
   apps/web/public/downloads/ArchiVox.RhinoPlugin.rhp
```

- [ ] **Step 2: Create the download page**

Create `apps/web/src/app/plugin/page.tsx`:

```tsx
export default function PluginPage() {
  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full">
        <p className="text-xs font-mono tracking-widest text-white/40 mb-4">
          ARCHIVOX · RHINO PLUGIN · v1.0.0
        </p>
        <h1 className="text-5xl font-bold mb-6">Download the plugin.</h1>
        <p className="text-white/60 text-lg mb-8">
          Compatible with Rhino 8 for Windows. Sets up in under two minutes —
          type <code className="text-green-400">ArchiVoxOpen</code> to launch the panel.
        </p>

        <ol className="text-white/70 text-sm space-y-3 mb-10 list-decimal list-inside">
          <li>Download and save the .rhp file below</li>
          <li>Open Rhino 8 → type <code className="text-green-400">PlugInManager</code> → Install</li>
          <li>Select the downloaded .rhp file</li>
          <li>Type <code className="text-green-400">ArchiVoxOpen</code> to open the chat panel</li>
          <li>Set your API key: add <code className="text-green-400">ARCHIVOX_API_KEY</code> to your environment variables</li>
        </ol>

        <a
          href="/downloads/ArchiVox.RhinoPlugin.rhp"
          download
          className="inline-flex items-center gap-3 bg-[#1B3A2D] hover:bg-[#234d3b] text-white px-8 py-4 rounded-xl text-base font-medium transition-colors"
        >
          ↓ Download ArchiVox.RhinoPlugin.rhp
        </a>

        <p className="mt-6 text-xs text-white/30">
          Requires Rhino 8 · Windows only (Mac support coming) · .NET 7
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Add plugin link to main nav**

In `apps/web/src/app/layout.tsx` or the nav component, add a link to `/plugin`.

- [ ] **Step 4: Test the download page locally**

```bash
cd apps/web
npm run dev
```

Navigate to `http://localhost:3000/plugin` — verify the page renders and the download link works.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/plugin/ apps/web/public/downloads/
git commit -m "feat: plugin download page at /plugin"
```
