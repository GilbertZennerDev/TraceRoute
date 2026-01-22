#include <map>
#include <vector>
#include <random>
#include <iostream>
#include <fstream>
using namespace std;

class Point
{
	private:
	double			x;
	double			y;
	unsigned int	id;
	public:
	Point();
	Point(const double &x, const double &y);
	Point &operator=(const Point &p);
	Point(unsigned int _id, unsigned int &spread);

	double getX() const;
	double getY() const;
	unsigned int getId() const;
};

Point::Point(){}

Point::Point(const double &_x, const double &_y)
{
	x = _x;
	y = _y;
}

Point& Point::operator=(const Point &p)
{
	if (this != &p)
	{
		this->id = p.getId();
		this->x = p.getX();
		this->y = p.getY();
	}
	return (*this);
}

Point::Point(unsigned int _id, unsigned int &spread)
{
	id = _id;
	x = rand() % spread;
	y = rand() % spread;
}

unsigned int Point::getId() const
{return id;}
double Point::getX() const
{return x;}
double Point::getY() const
{return y;}

void genPoints(const unsigned int amount, vector<Point *> &points, unsigned int spread)
{
	int i;

	i = -1;
	while (++i < amount)
		points.push_back(new Point(i, spread));
	cout << "Points generated!\n";
}

void deletePoints(const vector<Point *> &points)
{
		vector<Point *>::const_iterator it;

		it = points.begin();
		while (it != points.end())
			delete *it++;
		cout << "Points deleted!\n";
}

Point *getPointPos(const vector<Point *> &points, const unsigned int id)
{
	return (points[id]);
}

void getLineEquation(double &a, double &b, const Point &p1, const Point &p2)
{
	a = (p2.getY() - p1.getY())/(p2.getX() - p1.getX());
	b = p1.getY() - a * p1.getX();
}

void getOrthoLine(double &a, const Point &p1, double &a_o, double &b_o)
{
	if (a == 0) a = 0.001;
	a_o = - 1 / a;
	b_o = p1.getY() - a_o * p1.getX();
}

void getIntersectPoint(const double &a, const double &b, const double &a_o,\
const double &b_o, double &x_inter, double &y_inter)
{
	double div;

	div = (a - a_o);
	if (div == 0) div = 0.001;
	x_inter = (b_o - b)/div;
	y_inter = a_o * x_inter + b_o;
}

double getDistTwoPoints(const Point &p1, const Point &p2)
{
	return (sqrt(pow(p2.getY() - p1.getY(), 2) + pow(p2.getX() - p1.getX(), 2)));
}

Point *getIntersectPoint2(map<unsigned int, Point *> &intersect_arr, const unsigned int id)
{
	return (intersect_arr[id]);
}

bool	PointIsBetweenStartEnd(const Point &start, const Point &end, const Point &InterSectPoint)
{
	double tmp;
	double x_end;
	double x_inter;
	double x_start;
	
	x_end = end.getX();
	x_start = start.getX();
	x_inter = InterSectPoint.getX();

	//#special case x_start == x_end
	if (x_start > x_end)
	{
		tmp = x_start;
		x_start = x_end;
		x_end = tmp;
	}
	return (x_inter > x_start && x_inter < x_end);
}

void xClosestPoints(vector<unsigned int> &sortedIds, const unsigned int _x, const Point &start, const Point &end)
{
	int				i;
	unsigned int	x;

	i = -1;
	if (x > sortedIds.size()) x = sortedIds.size();
	else x = _x;

	sortedIds.erase(sortedIds.begin() + x - 1, sortedIds.end());
	cout << "All Closest Points gathered!\n";
}

void printArr(const vector<unsigned int> &arr)
{
	int i;

	i = -1;
	while (++i < arr.size())
		cout << arr[i] << "\n";
	i = -1;
	while (++i < 30)
		cout << "*";
	cout << "\n";
}

void printDistanceArr(const vector<unsigned int> &arr, const vector<Point *> &points, const Point &start)
{
	int i;
	Point *p;
	double distance;

	i = 0;
	while (++i < arr.size() - 1)
	{
		p = getPointPos(points, arr[i]);
		distance = getDistTwoPoints(*p, start);
		cout << distance << "\n";
	}
	i = -1;
	while (++i < 30)
		cout << "*";
	cout << "\n";
}

void checks(const unsigned int amountPoints, const unsigned int startIndex, const unsigned int endIndex, const unsigned int amountClosestPoints)
{
	bool error;

	error = false;
	if (amountPoints < 2) error = true;
	if (startIndex < 0 || startIndex > amountPoints - 1) error = true;
	if (endIndex < 0 || endIndex > amountPoints - 1) error = true;
	if (amountClosestPoints < 1 || amountClosestPoints > amountPoints) error = true;
	if (startIndex == endIndex) error = true;
	if (error) {cout << "Bad Args.\n"; exit(1);}
	cout << "Checks done!\n";
}

unsigned int	getIdofMinDist(const map<unsigned int, double> &dist_arr)
{
	unsigned int								id;
	map<unsigned int, double>::const_iterator	it;
	double										min;

	it = dist_arr.begin();
	id = it->first;
	min = numeric_limits<double>::max();
	if (dist_arr.size() == 0) return (0);
	while (it != dist_arr.end())
	{
		if (it->second <= min)
		{
			id = it->first;
			min = it->second;
		}
		++it;
	}
	return (id);
}

void	sortDistArr(const map<unsigned int, double> &dist_arr, vector<unsigned int> &sortedIds)
{
	unsigned int id;
	map<unsigned int, double> tmp_arr;
	map<unsigned int, double>::iterator it;
	map<unsigned int, double>::const_iterator cit;

	cit = dist_arr.begin();
	while (cit != dist_arr.end())
	{
		tmp_arr[cit->first] = cit->second;
		++cit;
	}
	cout << "Tmp generated!\n";
	sortedIds.clear();
	while (tmp_arr.size())
	{
		id = getIdofMinDist(tmp_arr);
		sortedIds.push_back(id);
		it = tmp_arr.find(id);
		if (it != tmp_arr.end()) tmp_arr.erase(it);
		else cout << "Error: id " << id << " not found in map.\n";
	}
	cout << "Distances sorted!\n";
}

void checkIsSorted(const map<unsigned int, double> &testmap, const vector<unsigned int> &testvector)
{
	int											i;
	map<unsigned int, double>::const_iterator	itm;
	double										lastValue;

	i = 0;
	lastValue = testmap.find(*testvector.begin())->second;
	while (++i < testvector.size())
	{
		itm = testmap.find(testvector[i]);
		cout << "Id: " << itm->first << " Ortho Distance to Direct Connection: " << itm->second << "\n";
		if (itm->second < lastValue){ cout << "Error: not sorted asc.\n" << itm->second << " " << lastValue << "\n";}
		lastValue = itm->second;
	}
	cout << "Is Sorted Asc.\n";
}

void saveCoords(const vector<Point *> &points, const vector<unsigned int> &sortedIds)
{
	int i;

	i = -1;
	ofstream outFile("pos.md");
	while (++i < sortedIds.size())
	{
		Point p;

		p = *getPointPos(points, sortedIds[i]);
		outFile << p.getX() << " " << p.getY() << "\n";
	}
	outFile.close();
}

int main(int ac, char **av)
{
	int							i;
	double						a;
	double						b;
	unsigned int				spread;
	unsigned int				endIndex;
	unsigned int				startIndex;
	unsigned int				amountPoints;
	unsigned int				amountClosestPoints;
	
	Point						end;
	Point						start;
	
//	vector<Point *>::iterator	itp;
	vector<Point *>				points;
	map<unsigned int, double>	dist_arr;
	vector<unsigned int>		sortedIds;

	if (ac != 6){cout << "Usage: " << av[0] << " amountPoints startIndex endIndex amountClosestPoints Spread"; exit(1);}

	srand(time(NULL));
	
	amountPoints = atoi(av[1]);
	startIndex = atoi(av[2]);
	endIndex = atoi(av[3]);
	amountClosestPoints = atoi(av[4]);
	spread = atoi(av[5]);
	checks(amountPoints, startIndex, endIndex, amountClosestPoints);

	genPoints(amountPoints, points, spread);
	start = *getPointPos(points, startIndex);
	end = *getPointPos(points, endIndex);
	getLineEquation(a, b, start, end);

	i = -1;
//	itp = points.begin();
	while (++i < points.size())
//	while (itp != points.end())
	{
		Point *p;
		double a_o;
		double b_o;
		double x_inter;
		double y_inter;
		double distance;
		
		if (points[i]->getId() == start.getId() || points[i]->getId() == end.getId()) continue;

		p = getPointPos(points, i);
		getOrthoLine(a, *p, a_o, b_o);
		getIntersectPoint(a, b, a_o, b_o, x_inter, y_inter);
		Point inter_p = Point(x_inter, y_inter);
		distance = getDistTwoPoints(inter_p, *p);
		if (PointIsBetweenStartEnd(start, end, inter_p)) dist_arr[p->getId()] = distance;
//		++itp;
//		++i;
	}
	cout << "All Point Distances gathered!\n";
	sortDistArr(dist_arr, sortedIds);
	xClosestPoints(sortedIds, amountClosestPoints, start, end);
	checkIsSorted(dist_arr, sortedIds);

	saveCoords(points, sortedIds);
	deletePoints(points);
	return (0);
}

