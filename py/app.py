"""
the idea is to construct a route between points on a grid
currently my trajectory works in 2d

3D will be implemented soon
no nach gesamt rees distanz berechnen:
einfach durch den endarray loopen an jeweils distanz vun punkti zu punkti+1 rechnen an addeiren
"""

import sys
import random as r
import numpy as np
import matplotlib.pyplot as plt
from math import sqrt as sqrt

def genPoints(amount, spread):
	points = [{'id': i, 'x': r.randint(0, spread), 'y': r.randint(0, spread)} for i in range(amount)]
	return points
	
def getPointPos(points, _id):
	return points[_id]

def getLineEquation(p1, p2):
	a = (p2['y'] - p1['y'])/(p2['x'] - p1['x'])
	b = p1['y'] - a * p1['x']
	return a, b

def getOrthoLine(a, point):
	if a != 0: a_o = - 1 / a
	else: a_o = - 1 / 0.001
	b_o = point['y'] - a_o * point['x']
	return a_o, b_o
	
def getIntersectPoint(a, b, a_o, b_o):
	div = (a - a_o)
	if div == 0: div = 0.001
	x_inter = (b_o - b)/div
	y_inter = a_o * x_inter + b_o
	return x_inter, y_inter

def getDistTwoPoints(p1, p2):
	return ((p2['y'] - p1['y'])**2 + (p2['x'] - p1['x'])**2)**.5

def PointIsBetweenStartEnd(start, end, InterSectPoint):
	x_inter = InterSectPoint['x']
	x_start = start['x']
	x_end = end['x']
	#special case x_start == x_end
	if x_start > x_end:
		tmp = x_start
		x_start = x_end
		x_end = tmp
	return (x_inter > x_start and x_inter < x_end)
	
def getIntersectPoint2(intersect_arr, id):
	for p in intersect_arr:
		if p['id'] == id: return (p)
	return -1

def xClosestPoints(sortedPoints, x, intersect_arr, start, end):
	cleanSortedPoints = []
	for p in sortedPoints:
		intersectPoint = getIntersectPoint2(intersect_arr, p['id'])
#		print("intersectPoint", intersectPoint)
		if intersectPoint == -1: print("Bad Intersect Point"); exit()
		if PointIsBetweenStartEnd(start, end, intersectPoint['p']):
			cleanSortedPoints.append(p)
	arr = cleanSortedPoints[:x]
	return arr
	
def printArr(arr):
	for el in arr: print(el)
	print("*"*30)

def printPointsMap(points, xClosestPoints, start, end, amountPoints, spread):
	x = [p['x'] for p in points]
	y = [p['y'] for p in points]

	closestPoints = [points[p['id']] for p in xClosestPoints]
	print(closestPoints)
	x_closest = [p['x'] for p in closestPoints]
	y_closest = [p['y'] for p in closestPoints]
	
	x_start_end = [start['x'], end['x']]
	y_start_end = [start['y'], end['y']]

	plt.scatter(x, y, marker='.')
	plt.scatter(x_closest, y_closest, color='red', marker='.')
	plt.scatter(x_start_end, y_start_end, color='orange', marker='x')
	plt.show()

def checks(amountPoints, startIndex, endIndex, amountClosestPoints):
	error = False
	if amountPoints < 2: error = True
	if startIndex < 0 or startIndex > amountPoints - 1: error = True
	if endIndex < 0 or endIndex > amountPoints - 1: error = True
	if amountClosestPoints < 1 or amountClosestPoints > amountPoints: error = True
	if startIndex == endIndex: error = True
	if error: print("Bad Args"); exit()
	
def	main():
	av = sys.argv
	ac = len(av)
	if ac != 6: print(f"Usage:python3 {av[0]} \
	amountPoints startIndex endIndex amountClosestPoints Spread"); exit()
	
	amountPoints = int(av[1])
	startIndex = int(av[2])
	endIndex = int(av[3])
	amountClosestPoints = int(av[4])
	spread = int(av[5])
	
	checks(amountPoints, startIndex, endIndex, amountClosestPoints)
	
	points = genPoints(amountPoints, spread)
	start = getPointPos(points, startIndex)
	start = {'id': 0, 'x': 0, 'y': 0}
	end = getPointPos(points, endIndex)
	end = {'id': 1, 'x': spread, 'y': spread}

	rest = [p for p in points if p['id'] != startIndex and p['id'] != endIndex]
	a, b = getLineEquation(start, end)
	dist_arr = []
	intersect_arr = []
	for p in rest:
		a_o, b_o = getOrthoLine(a, p)
		x_inter, y_inter = getIntersectPoint(a, b, a_o, b_o)
		p1 = {'x': x_inter, 'y': y_inter}
		intersect_arr.append({'id': p['id'], 'p': p1})
		distance = getDistTwoPoints(p1, p)
		dist_arr.append({'id': p['id'], 'distance': round(distance, 0)})
	dist_arr_sorted = sorted(dist_arr, key=lambda x: x['distance'])

	closestPoints = xClosestPoints(dist_arr_sorted, amountClosestPoints, intersect_arr, start, end)
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
	#berechne mer reesedistanz:#
	getDistance = lambda p1, p2: sqrt((p2['x'] - p1['x'])**2 + (p2['y'] - p1['y'])**2)
	direct_distance = getDistance(start, end)
	print("Direct Distance:", direct_distance)
	print("Should be:", sqrt(2*spread**2))
	print("Diff:", direct_distance - sqrt(2*spread**2))
	total_distance = 0
	distances = []
	for i in range(0, len(trajectory) - 1):
		p1 = points[trajectory[i]]
		p2 = points[trajectory[i + 1]]
		dist = getDistance(p1, p2)
		distances.append(distance)
	print("Distances:", distances)
	print("Total Distance:", sum(distances))
	print("Diff to Direct Distance:", sum(distances) - direct_distance)
	printPointsMap(points, closestPoints, start, end, amountPoints, spread)

if __name__ == '__main__': main()
