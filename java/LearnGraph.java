//import javafx.application.Application; // .Application muss dobäi sinn
//import javafx.stage.Stage;             // Fir de Symbol 'Stage' ze fannen
//import javafx.scene.Scene;             // Wahrscheinlech och néideg

import javafx.application.Application; 
import static javafx.application.Application.launch; 
import javafx.scene.Group; 
import javafx.scene.Scene; 
import javafx.stage.Stage; 
import javafx.scene.chart.NumberAxis; 
import javafx.scene.chart.ScatterChart; 
import javafx.scene.chart.XYChart;
         
public class LearnGraph extends Application { 
   @Override 
   public void start(Stage stage) {     
      //Defining the axes               
      NumberAxis xAxis = new NumberAxis(0, 1000, 100); 
      xAxis.setLabel("X Coord");          
        
      NumberAxis yAxis = new NumberAxis(0, 1000, 100); 
      yAxis.setLabel("Y Coord"); 
      
      //Creating the Scatter chart 
      ScatterChart<String, Number> scatterChart = 
      new ScatterChart(xAxis, yAxis);         
         
      //Prepare XYChart.Series objects by setting data 
      XYChart.Series series = new XYChart.Series();  
      series.getData().add(new XYChart.Data(800, 120)); 
      series.getData().add(new XYChart.Data(400, 55)); 
      series.getData().add(new XYChart.Data(110, 140)); 
      series.getData().add(new XYChart.Data(40, 500)); 
      series.getData().add(new XYChart.Data(300, 350)); 
      series.getData().add(new XYChart.Data(65, 700));
                
      //Setting the data to scatter chart        
      scatterChart.getData().addAll(series); 
         
      //Creating a Group object  
      Group root = new Group(scatterChart); 
         
      //Creating a scene object 
      Scene scene = new Scene(root, 600, 400);  
      
      //Setting title to the Stage 
      stage.setTitle("Scatter Chart"); 
         
      //Adding scene to the stage 
      stage.setScene(scene); 
         
      //Displaying the contents of the stage 
      stage.show(); 
   } 
   public static void main(String args[]){ 
      launch(args); 
   } 
}
