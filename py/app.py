"""
the idea is to construct a route between points on a grid
currently my trajectory works in 2d

3D will be implemented soon
"""

import sys
import random as r

def genPoints(amount):
	points = [{'id': i, 'x': r.randint(-1000, 1000), 'y': r.randint(-1000, 1000)} for i in range(amount)]
	return points
	
def getPointPos(points, _id):
	return points[_id]

def getLineEquation(p1, p2):
	a = (p2['y'] - p1['y'])/(p2['x'] - p1['x'])
	b = p1['y'] - a * p1['x']
	return a, b

def getOrthoLine(a, point):
	a_o = - 1 / a
	b_o = point['y'] - a_o * point['x']
	return a_o, b_o
	
def getIntersectPoint(a, b, a_o, b_o):
	x_inter = (b_o - b)/(a - a_o)
	y_inter = a_o * x_inter + b_o
	return x_inter, y_inter

def getTriArea(length, height):
	return 0.5 * length * height

def getDistTwoPoints(p1, p2):
	return ((p2['y'] - p1['y'])**2 + (p2['x'] - p1['x'])**2)**.5
	
def xClosestPoints(sortedPoints, x):
	arr = sortedPoints[:x]
	return arr
	
def printArr(arr):
	for el in arr: print(el)
	print("*"*30)

def	main():
	av = sys.argv
	ac = len(av)
	if ac != 5: print(f"Usage:python3 {av[0]} \
	amountPoints startIndex endIndex amountClosestPoints"); exit()
	
	amountPoints = int(av[1])
	startIndex = int(av[2])
	endIndex = int(av[3])
	amountClosestPoints = int(av[4])
	
	points = genPoints(amountPoints)
	start = getPointPos(points, startIndex)
	end = getPointPos(points, endIndex)

	rest = [p for p in points if p['id'] != startIndex and p['id'] != endIndex]
	a, b = getLineEquation(start, end)
	dist_arr = []
	for p in rest:
		a_o, b_o = getOrthoLine(a, p)
		x_inter, y_inter = getIntersectPoint(a, b, a_o, b_o)
		p1 = {'x': x_inter, 'y': y_inter}
		distance = getDistTwoPoints(p1, p)
		dist_arr.append({'id': p['id'], 'distance': round(distance, 0)})
	dist_arr_sorted = sorted(dist_arr, key=lambda x: x['distance'])
	printArr(dist_arr_sorted)

	closestPoints = xClosestPoints(dist_arr_sorted, amountClosestPoints)
	printArr(closestPoints)

	distance_to_start = []
	for p in closestPoints:
		currentPoint = getPointPos(points, p['id'])
		distance = getDistTwoPoints(currentPoint, start)
		distance_to_start.append({'id': p['id'], 'distance': round(distance, 0)})
	distance_to_start_sorted = sorted(distance_to_start, key=lambda x: x['distance'])
	path_ids = [p['id'] for p in distance_to_start_sorted]
	trajectory = [start['id']] + path_ids + [end['id']]
	print(trajectory)

if __name__ == '__main__': main()
