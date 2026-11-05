---
name: gamedev-engine-patterns
description: Game engine architecture, Unity C# design patterns, frame-rate budgeting, finite state machines (FSM), and garbage collection avoidance.
---
**Game Systems Engineering Standards**
1. Architecture and Modularity:
   - Decouple gameplay rules, physics simulations, and visual renderers into distinct subsystems.
   - Employ Finite State Machines (FSM) or hierarchical state architectures to govern character states, animation trees, and AI behaviors.
   - Utilize decoupled event buses or observer patterns to notify HUD/UI systems of health, inventory, and score updates.
2. Frame Rate and Memory Optimization:
   - Implement object pooling for ephemeral entities (projectiles, particle effects, enemies) to eliminate runtime heap allocations and garbage collection spikes.
   - Zero allocation in per-frame loops: prohibit string concatenations, boxing, LINQ, and temporary heap object allocations inside `Update` / `Tick` routines.
   - Batch static and dynamic geometry to reduce GPU draw calls and state changes.
3. Input and Physics Decoupling:
   - Isolate input polling (`Update`) from fixed-timestep deterministic physics simulations (`FixedUpdate`).
