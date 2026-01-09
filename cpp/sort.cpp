#include <map>
#include <vector>
#include <iostream>
#include <random>
using namespace std;

unsigned int	getIdofMinDist(map<unsigned int, double> &dist_arr)
{
	double	min;
	unsigned int id;
	map<unsigned int, double>::iterator it;

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

void	sortDistArr(map<unsigned int, double> &dist_arr, vector<unsigned int> &sortedIds)
{
	unsigned int id;
	map<unsigned int, double> tmp_arr;
	map<unsigned int, double>::iterator it;

	it = dist_arr.begin();
	while (it != dist_arr.end())
	{
		tmp_arr[it->first] = it->second;
		++it;
	}
	sortedIds.clear();
	while (tmp_arr.size())
	{
		id = getIdofMinDist(tmp_arr);
		sortedIds.push_back(id);
		it = tmp_arr.find(id);
		if (it != tmp_arr.end()) tmp_arr.erase(it);
		else cout << "Error: id " << id << " not found in map.\n";
	}
}

void checkIsSorted(map<unsigned int, double> &testmap, vector<unsigned int> &testvector)
{
	int i;
	double lastValue;
	map<unsigned int, double>::iterator itm;
	// check, is sorted?
	i = 0;
	cout << "*****\nTest4\n";
	lastValue = testmap.find(*testvector.begin())->second;
	//cout << "debug lastValue:" << lastValue << "\n";
	while (++i < testvector.size())
	{
		itm = testmap.find(testvector[i]);
		cout << itm->first << " " << itm->second << "\n";
		if (itm->second < lastValue){ cout << "Error: not sorted asc.\n" << itm->second << " " << lastValue << "\n";}
		lastValue = itm->second;
	}
}

int main()
{
	int i;
	double lastValue;
	unsigned int size;
	unsigned int amount;
	vector<unsigned int> testvector;
	vector<unsigned int>::iterator itv;
	
	map<unsigned int, double> testmap;
	map<unsigned int, double>::iterator itm;

	srand(time(NULL));
	i = -1;
	size = 20;
	amount = 10;
	while (++i < amount)
		testmap[i] = rand() % size;

	itm = testmap.begin();
	while (itm != testmap.end())
	{
		cout << itm->first << " " << itm->second << "\n";
		++itm;
	}
	cout << "*****\n";
	i = -1;
	while (i < amount)
	{
		itm = testmap.find(i);
		if (itm != testmap.end()) cout << i << " " << testmap.find(i)->second << "\n";
		else cout << "Key " << i << " not found.\n";
		++i;
	}
	sortDistArr(testmap, testvector);
	cout << "*****\nTest3\n";
	itv = testvector.begin();
	i = -1;
	while (++i < testvector.size())
	{
		itm = testmap.find(testvector[i]);
		cout << *itv << " " << itm->second << "\n";
		++itv;
	}
	// check, is sorted?
	checkIsSorted(testmap, testvector);	
	return (0);
}
