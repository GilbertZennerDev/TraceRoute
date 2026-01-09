# TRACE ROUTE:

# Proximity-Based Pathfinding: Python to C++ Implementation

A spatial analysis tool designed to find and sort the closest points to a trajectory line segment. This project demonstrates a complete workflow: prototyping complex geometric logic in **Python** and migrating to **C++** for memory efficiency and performance.

## 🚀 The Project

The algorithm calculates the orthogonal projection of random points onto a line segment defined by a start and end point. It filters points that fall strictly within the segment's boundaries and identifies the  closest neighbors.

### Key Features

* **Geometric Precision**: Implements linear equations () and orthogonal intersections to find exact spatial relationships.
* **Boundary Validation**: Uses a specific check to ensure points are geographically "between" the start and end coordinates.
* **Cross-Language Development**:
* **Python**: Fast prototyping with `matplotlib` for visual verification.
* **C++**: High-performance implementation with manual memory management and custom sorting logic.



---

## 🛠 Technical Comparison

| Feature | Python Implementation 🐍 | C++ Implementation ⚙️ |
| --- | --- | --- |
| **Development Time** | ~3 Hours | ~10 Hours |
| **Memory Management** | Automatic (Garbage Collected) | Manual (Leak-free `new`/`delete`) |
| **Libraries** | `numpy`, `matplotlib`, `random` | `vector`, `map`, `iostream` |
| **Sorting** | Built-in `sorted()` with Lambdas | Custom `getIdofMinDist` logic |

---

## 💻 Usage

Both versions accept five command-line arguments:

1. `amountPoints`: Total points to generate.
2. `startIndex`: ID of the path start.
3. `endIndex`: ID of the path end.
4. `amountClosestPoints`: Number of neighbors to find.
5. `Spread`: The coordinate range (0 to N).

### Running C++

```bash
g++ main.cpp -o pathfinder
./pathfinder 100 0 99 5 500

```

### Running Python

```bash
python3 app.py 100 0 99 5 500

```

---

## 🧠 Logic Flow

1. **Generation**: Points are generated within a defined `spread`.
2. **Projection**: The script calculates the line equation between the start/end points.
3. **Orthogonal Math**: For every other point, it finds the perpendicular intersection on that line.
4. **Filtering**: Only points whose intersection lies *on* the segment are considered.
5. **Sorting**: Points are ranked by their distance to the line.

---

## 📈 Future Goals

* [ ] **3D Implementation**: Expanding the coordinate system to include Z-axis calculations.
* [ ] **Optimization**: Implementing `std::sort` with custom comparators in C++.

---
