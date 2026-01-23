import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.Files;

import java.util.*;
import java.util.Map;
import java.util.List;
import java.util.Scanner;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.stream.Collectors;

import javafx.scene.Group; 
import javafx.scene.Scene; 
import javafx.stage.Stage;
import javafx.scene.chart.XYChart;
import javafx.scene.chart.NumberAxis; 
import javafx.application.Application;
import javafx.scene.chart.ScatterChart; 
import static javafx.application.Application.launch; 

class Point
{
	int				id;
	int				spread;
	double			x;
	double			y;

	Point(int _id, int _spread, Random random)
	{
		id = _id;
		spread = _spread;
		x = random.nextDouble() * spread;
		y = random.nextDouble() * spread;
	}

	Point(double _x, double _y)
	{
		x = _x;
		y = _y;
	}

	int getId(){return id;}
	double getX(){return x;}
	double getY(){return y;}
}

public class TraceRoute extends Application
{
    private static double line_a;
    private static double line_b;
	private static boolean DEBUG = false;
	private static int GRAPH_SPREAD = 1000;
	private static final int GRAPH_WIDTH = 1800;
	private static final int GRAPH_HEIGHT = 900;
	private static List<Double> allPointsX = new ArrayList<>();
    private static List<Double> allPointsY = new ArrayList<>();
	private static List<Double> closestPointsX = new ArrayList<>();
    private static List<Double> closestPointsY = new ArrayList<>();
    private static Point startPoint;
    private static Point endPoint;


	static private void print(String msg)
	{
		System.out.println(msg);
	}
	
	static private void printDouble(final String msg, final double v)
	{
		print(msg + " " + Double.toString(v));
	}
	
	static private void printInt(final String msg, final int v)
	{
		print(msg + " " + Integer.toString(v));
	} 
	
	private boolean checks(final int amountPoints, final int startIndex, final int endIndex, final int amountClosestPoints)
	{
		boolean error;

		error = false;
		if (amountPoints < 2) error = true;
		if (startIndex < 0 || startIndex > amountPoints - 1) error = true;
		if (endIndex < 0 || endIndex > amountPoints - 1) error = true;
		if (amountClosestPoints < 1 || amountClosestPoints > amountPoints) error = true;
		if (startIndex == endIndex) error = true;
		if (error) {print("Bad Args.\n"); return (false);}
		print("Checks done!\n");
		return (true);
	}
	
	void genPoints(final int amount, List<Point> points, int spread, final Random random)
	{
		int i;

		i = -1;
		if (amount < 1) return ;
		while (++i < amount){
			points.add(new Point(i, spread, random));
			double x = points.get(i).getX();
			double y = points.get(i).getY();
			if (DEBUG) printDouble("x", x);
			allPointsX.add(x);
			allPointsY.add(y);
			}
		print("Points generated!\n");
	}
	
	Point getPointPos(final List<Point> points, final int id)
	{
		return (points.get(id));
	}
	
	double getLineEquation_a(final Point p1, final Point p2)
	{
		double a;

		a = (p2.getY() - p1.getY())/(p2.getX() - p1.getX());
		return (a);
	}
	
	double getLineEquation_b(final Point p1, final Point p2)
	{
		double a;
		double b;

		a = (p2.getY() - p1.getY())/(p2.getX() - p1.getX());
		b = p1.getY() - a * p1.getX();
		return (b);
	}
	
	double getOrthoLine_a_o(final double _a)
	{
		double a;
		double a_o;

		a = _a;
		if (a == 0) a = 0.001;
		a_o = - 1 / a;
		return (a_o);
	}
	
	double getOrthoLine_b_o(final double _a, final Point p1)
	{
		double a;
		double a_o;
		double b_o;

		a = _a;
		if (a == 0) a = 0.001;
		a_o = - 1 / a;
		b_o = p1.getY() - a_o * p1.getX();
		return (b_o);
	}
		
	double getIntersectPoint_x_inter(final double a, final double b, final double a_o, final double b_o)
	{
		double div;
		double x_inter;

		div = (a - a_o);
		if (div == 0) div = 0.001;
		x_inter = (b_o - b)/div;
		return (x_inter);
	}
	
	double getIntersectPoint_y_inter(final double a, final double b, final double a_o, final double b_o)
	{
		double div;
		double x_inter;
		double y_inter;

		div = (a - a_o);
		if (div == 0) div = 0.001;
		x_inter = (b_o - b)/div;
		y_inter = a_o * x_inter + b_o;
		return (y_inter);
	}
	
	double getDistTwoPoints(final Point p1, final Point p2)
	{
		return (Math.sqrt(Math.pow(p2.getY() - p1.getY(), 2) + Math.pow(p2.getX() - p1.getX(), 2)));
	}
	
	boolean	PointIsBetweenStartEnd(final Point start, final Point end, final Point InterSectPoint)
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
	
	void	sortDistArr(final Map<Integer, Double> distances, List<Integer> sortedIds)
	{
		Map<Integer, Double> sortedMap = distances.entrySet()
    .stream()
    .sorted(Map.Entry.comparingByValue())
    .collect(Collectors.toMap(
        Map.Entry::getKey,
        Map.Entry::getValue,
        (e1, e2) -> e1,
        LinkedHashMap::new
    ));
    
    sortedIds.clear();
    if (DEBUG) sortedMap.forEach((k, v) -> System.out.println(k + " -> " + v));
    sortedMap.forEach((k, v) -> sortedIds.add(k));
	print("Distances sorted!\n");
	}
	
	void xClosestPoints(final List<Point> points, List<Integer> sortedIds, final int _x, final Point start, final Point end)
	{
		int	i;
		int	x;

		x = _x;
		if (x > sortedIds.size()) x = sortedIds.size();
		else x = _x;
		
		while (sortedIds.size() > _x)
			sortedIds.remove(_x);
		i = -1;
		while (++i < sortedIds.size())
		{
			closestPointsX.add(points.get(sortedIds.get(i)).getX());
			closestPointsY.add(points.get(sortedIds.get(i)).getY());
		}
		print("All Closest Points gathered!\n");
	}
	
	void checkIsSorted(final Map<Integer, Double> distances, final List<Integer> sortedIds, final int amountPoints)
	{
		int i;
		int k;
		double first;
		double test;
		
		first = 0;
		i = -1;
		while (++i < 1000)
		{
			try{
			first = distances.get(i);
			break;
			}
			catch (Exception e)
			{
			}
		}
		k = -1;
		while (++k < sortedIds.size())
		{
			if (k == i) continue;
			try{
			test = distances.get(k);
			if (test > first)
			{print("Error: Not Sorted.\n"); return ;}
			}
			catch (Exception e)
			{
			}
		}
		print("SUCCESS: Is Sorted.\n");
	}
	
	void savePoints(List<Integer> sortedIds, List<Point> points, String filename)
	{
		if (filename == null || filename.length() == 0)
			return ;

		Point p;
		StringBuilder sb;
		StringBuilder pos;
		
		sb = new StringBuilder();
		pos = new StringBuilder();
		for (Integer i: sortedIds)
		{
			pos.setLength(0);	
			p = points.get(i);
			pos.append(Double.toString(p.getX())).append(" ").append(Double.toString(p.getY())).append("\n");
			sb.append(pos.toString());
		}		
		try {
            Files.writeString(Paths.get(filename), sb.toString());
        } catch (Exception e) {
            e.printStackTrace();
        }
	}
	
	@Override 
	public void start(Stage stage)
	{
		NumberAxis xAxis = new NumberAxis(0, GRAPH_SPREAD, GRAPH_SPREAD / 10); 
		xAxis.setLabel("X Coord");          

		NumberAxis yAxis = new NumberAxis(0, GRAPH_SPREAD, GRAPH_SPREAD / 10); 
		yAxis.setLabel("Y Coord"); 

		//Creating the Scatter chart 
		ScatterChart<Number, Number> scatterChart = 
		new ScatterChart(xAxis, yAxis);

		scatterChart.setPrefWidth(GRAPH_WIDTH);  // Breet op 800 Pixel
		scatterChart.setPrefHeight(GRAPH_HEIGHT); // Héicht op 600 Pixel

		// 1. D'Series definéieren
		XYChart.Series<Number, Number> seriesAllPoints = new XYChart.Series<>();
		seriesAllPoints.setName("Map Points");
		
		XYChart.Series<Number, Number> seriesClosestPoints = new XYChart.Series<>();
		//seriesAllPoints.setName("Closest Points");
		
		XYChart.Series<Number, Number> seriesStartAndEndPoints = new XYChart.Series<>();
		//seriesAllPoints.setName("Start and End Points");
		
		XYChart.Series<Number, Number> seriesLineStartEnd = new XYChart.Series<>();

		for (int i = 0; i < allPointsX.size(); i++)
			seriesAllPoints.getData().add(new XYChart.Data<>(allPointsX.get(i), allPointsY.get(i)));
			
		for (int i = 0; i < closestPointsX.size(); i++)
			seriesClosestPoints.getData().add(new XYChart.Data<>(closestPointsX.get(i), closestPointsY.get(i)));
		
		for (int i = 0; i < GRAPH_SPREAD; i++)
		{	
			if (i >= Math.min(startPoint.getX(), endPoint.getX()) && i <= Math.max(startPoint.getX(), endPoint.getX()))
				seriesLineStartEnd.getData().add(new XYChart.Data<>(i, line_a * i + line_b));
		}
		
		seriesStartAndEndPoints.getData().add(new XYChart.Data<>(startPoint.getX(), startPoint.getY()));
		seriesStartAndEndPoints.getData().add(new XYChart.Data<>(endPoint.getX(), endPoint.getY()));

		// 3. D'Series dem Chart dobäiginn
		scatterChart.getData().add(seriesAllPoints);
		scatterChart.getData().add(seriesClosestPoints);
		scatterChart.getData().add(seriesStartAndEndPoints);
		scatterChart.getData().add(seriesLineStartEnd);
 
		//Creating a Group object  
		Group root = new Group(scatterChart); 
 
		//Creating a scene object 
		Scene scene = new Scene(root, GRAPH_WIDTH, GRAPH_HEIGHT);  

		//Setting title to the Stage 
		stage.setTitle("Scatter Chart"); 
 
		//Adding scene to the stage 
		stage.setScene(scene); 
 
		//Displaying the contents of the stage 
		stage.show();
	};
	
	public void runTraceRoute(String[] args)
	{
		double	a;
		double	b;
		int		i;
		int		amountPoints;
		int		startIndex;
		int		endIndex;
		int		amountClosestPoints;
		int		spread;
		Point	end;
		Point	start;
		Random random;

		print("TraceRoute working.");
		if (args.length != 5 && args.length != 6){print("Usage: amountPoints startIndex endIndex amountClosestPoints Spread"); return ;}
		try{
		amountPoints = Integer.parseInt((args[0]));
		startIndex = Integer.parseInt((args[1]));
		endIndex = Integer.parseInt((args[2]));
		amountClosestPoints = Integer.parseInt((args[3]));
		spread = Integer.parseInt((args[4]));
		GRAPH_SPREAD = spread;
		DEBUG = args.length == 6;
		if (!checks(amountPoints, startIndex, endIndex, amountClosestPoints)) return ;
		}
		catch(Exception e)
		{return ;}

		random = new Random();
		List<Point> points = new ArrayList<>();
		List<Integer> sortedIds = new ArrayList<>();
		genPoints(amountPoints, points, spread, random);
		
		start = getPointPos(points, startIndex);
		startPoint = start;
		end = getPointPos(points, endIndex);
		endPoint = end;
		
		a = getLineEquation_a(start, end);
		line_a = a;
		b = getLineEquation_b(start, end);
		line_b = b;
		
		Map<Integer, Double> distances = new HashMap<>();
		for(Point p: points)
		{
			double	a_o;
			double	b_o;
			Point	inter_p;
			double	x_inter;
			double	y_inter;
			double	distance;
			
			x_inter = 0;
			y_inter = 0;
			
			a_o = 0;
			b_o = 0;
			
			if (p.getId() == start.getId() || p.getId() == end.getId()) continue;
			
			a_o = getOrthoLine_a_o(a);
			b_o = getOrthoLine_b_o(a, p);
			x_inter = getIntersectPoint_x_inter(a, b, a_o, b_o);
			y_inter = getIntersectPoint_y_inter(a, b, a_o, b_o);
			
			inter_p = new Point(x_inter, y_inter);
			distance = getDistTwoPoints(inter_p, p);
			if (PointIsBetweenStartEnd(start, end, inter_p)) distances.put(p.getId(), distance);
		}
		print("All Point Distances gathered!\n");
		sortDistArr(distances, sortedIds);
		xClosestPoints(points, sortedIds, amountClosestPoints, start, end);
		print("Now saving the Points...");		
		savePoints(sortedIds, points, "PointsPositions.md");
		print("Done with Points, now time for the graph...");
		launch(args);
	}
	public static void main(String[] args)
	{
		TraceRoute tr = new TraceRoute();
		
		tr.runTraceRoute(args);
	}
}
