📍 TraceRoute
TraceRoute is a high-performance trajectory generator designed to construct intelligent routes between points on a grid. By using advanced geometric projections, it identifies the most "logical" path between a start and end destination within a field of scattered nodes.

✨ Why This Method is Superior
Unlike simple "nearest neighbor" algorithms that can lead you in circles or away from your goal, TraceRoute uses a sophisticated Orthogonal Intersection Strategy:

Linear Optimization: It establishes a direct vector (ideal path) between your start and end points.

Orthogonal Projection: Every potential node is projected onto this vector to find its "relative progress."

Strict Boundary Filtering: It ignores nodes that fall "behind" the start or "beyond" the end, ensuring zero wasted movement.

Proximity Sorting: It selects the points closest to the ideal path line, resulting in a trajectory that is both smooth and goal-oriented. 🚀

🛠️ Features
✅ Dynamic Point Generation: Create random point clouds with custom density and spread.

✅ 2D Trajectory Logic: Fully functional 2D pathfinding using NumPy and Matplotlib.

✅ Visual Feedback: Real-time plotting of the point cloud, start/end nodes, and the selected path.

🚧 3D Implementation: Coming Soon! (Currently in development to support volumetric navigation).

🚀 Getting Started
Prerequisites
Python 3.x

Dependencies: numpy, matplotlib

Installation
Bash

git clone https://github.com/GilbertZennerDev/TraceRoute.git
cd TraceRoute
pip install numpy matplotlib
Usage
Run the script using the following arguments:

Bash

python3 main.py <amountPoints> <startIndex> <endIndex> <amountClosestPoints> <spread>
Example:

Bash

python3 main.py 50 0 49 5 100
This generates 50 points in a 100x100 grid and finds a path between point 0 and 49 using the 5 most optimal intermediate nodes.

📊 Visualization
When you run the script, TraceRoute generates a visual map of your path:

🔵 Blue Points: Available nodes in the grid.

🟠 Orange Points: Your designated Start and End points.

🔴 Red Points: The optimized trajectory selected by the algorithm.

🗺️ Roadmap
[x] 2D Geometric Pathfinding

[x] Matplotlib Visualizer Integration

[ ] 3D Trajectory Support (In Progress 🏗️)

[ ] Weighted Node Support (Prioritize nodes based on cost)

🤝 Contributing
Contributions are welcome! If you have ideas for the 3D implementation or want to optimize the math further, feel free to fork and submit a PR.

Developed with ❤️ by GilbertZennerDev


