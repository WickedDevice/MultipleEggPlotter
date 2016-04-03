angular.module('MyApp', ['ngFileUpload'])
.controller('UploadCtrl', ['$scope', 'Upload', '$timeout', function ($scope, Upload, $timeout) {

    $scope.csvdata = [];
    $scope.zoom_start_date = null;
    $scope.zoom_end_date = null;
    $scope.csv_header_row = [];
    $scope.csv_header_row_reduced = [];
    $scope.trace1_field = null;
    $scope.trace2_field = null;
    $scope.primary_column = null;
    $scope.secondary_column = null;
    $scope.primary_columns = [];
    $scope.secondary_columns = [];
    $scope.primary_axis_title = null;
    $scope.secondary_axis_title = null;

    $scope.header_loaded = function(){
        return $scope.csv_header_row.length > 0;
    };

    $scope.addToPlotPrimary = function(){
      // add all the columns that look "like" csv_header_row_reduced[primary_column]
      if($scope.primary_column === null){
        return;
      }

      $scope.primary_axis_title = $scope.csv_header_row_reduced[$scope.primary_column].name;

      $scope.primary_columns = [];
      for(var ii = 0; ii < $scope.csv_header_row.length; ii++){
        if($scope.csv_header_row[ii].name.indexOf($scope.primary_axis_title) >= 0){
          $scope.primary_columns.push(ii);
        }
      }

      renderPlots();
    };

    $scope.removeFromPlotPrimary = function(){
      $scope.primary_columns = [];
      $scope.primary_axis_title = null;
      renderPlots();
    };

    $scope.addToPlotSecondary = function(){
      // add all the columns that look "like" csv_header_row_reduced[seconday_column]
      if($scope.secondary_column === null){
        return;
      }

      $scope.secondary_axis_title = $scope.csv_header_row_reduced[$scope.secondary_column].name;

      $scope.secondary_columns = [];
      for(var ii = 0; ii < $scope.csv_header_row.length; ii++){
        if($scope.csv_header_row[ii].name.indexOf($scope.secondary_axis_title) >= 0){
          $scope.secondary_columns.push(ii);
        }
      }

      renderPlots();
    };

    $scope.removeFromPlotSecondary = function(){
      $scope.secondary_columns = [];
      $scope.secondary_axis_title = null;
      renderPlots();
    };

    $scope.primary_column_change = function() {
      $scope.trace1_field = $scope.primary_column
    }

    $scope.secondary_column_change = function() {
      $scope.trace2_field = $scope.secondary_column
    }

    $scope.uploadFiles = function (files) {
        $scope.files = files;
        if (files && files.length) {
            $scope.generated_filename = null;
            Upload.upload({
                url: 'upload',
                method: 'POST',
                data: {
                    files: files
                }
            }).then(function (response) { // file is uploaded successfully
                $timeout(function () {
                    $scope.result = response.data;
                    $scope.progress = -1; // clear the progress bar


                    $scope.csv_header_row = response.data.data[0].map(function(value, index){
                       return {
                           idx: index,
                           name: value
                       };
                    });

                    // hyphen is a delimiter, what we really want is a list of the unique
                    // things that are to the right of hypens in the values above
                    $scope.csv_header_row_reduced = {};
                    for(var ii = 0; ii < $scope.csv_header_row.length; ii++){
                      var name = $scope.csv_header_row[ii].name;
                      var rhs = name.split('-');
                      if(rhs.length > 1){
                        $scope.csv_header_row_reduced[rhs[1]] = 1;
                      }
                    }
                    // rewind the keys back into an array
                    $scope.csv_header_row_reduced = Object.keys($scope.csv_header_row_reduced).map(function(value, index){
                      return {
                        idx: index,
                        name: value
                      };
                    });


                    $scope.generated_filename = response.data.filename.split(".")[0];
                    $scope.csvdata = response.data.data;
                    for(var ii = 1; ii < $scope.csvdata.length; ii++){
                        var m = moment($scope.csvdata[ii][0], "YYYY-MM-DD HH:mm:ss");
                        $scope.csvdata[ii][0] = {
                            str: $scope.csvdata[ii][0],
                            moment: m
                        };

                        for(var jj = 1; jj < $scope.csvdata[ii].length; jj++){
                            var val = null;
                            try{
                                val = parseFloat($scope.csvdata[ii][jj])
                                if(!isNaN(val)) {
                                    $scope.csvdata[ii][jj] = val;
                                }
                                else{
                                    $scope.csvdata[ii][jj] = null;
                                }
                            }
                            catch(e){
                                $scope.csvdata[ii][jj] = null;
                            }
                        }
                    }

                    renderPlots();
                });
            }, function (response) {      // handle error
                if (response.status > 0) {
                    $scope.errorMsg = response.status + ': ' + response.data;
                    $scope.progress = -1; // clear the progress bar
                }
            }, function (evt) {          // progress notify
                $scope.progress =
                    Math.min(100, parseInt(100.0 * evt.loaded / evt.total));
            });
        }
    };

    function renderPlots(){

        var data = [];
        if($scope.primary_columns) {
          for (var ii = 0; ii < $scope.primary_columns.length; ii++) {
            var column = $scope.primary_columns[ii];
            var trace = {
              x: $scope.csvdata.map(function (currentValue, index) {
                return currentValue[0].str; // always plot against time
              }).slice(1),
              y: $scope.csvdata.map(function (currentValue, index) {
                return parseFloat(currentValue[column]);
              }).slice(1),
              mode: 'lines+markers',
              yaxis: 'y',
              type: 'scatter',
              name: $scope.csv_header_row[column].name
            };
            data.push(trace);
          }
        }

        if($scope.secondary_columns) {
          for (var ii = 0; ii < $scope.secondary_columns.length; ii++) {
            var column = $scope.secondary_columns[ii];
            var trace = {
              x: $scope.csvdata.map(function(currentValue, index){
                return currentValue[0].str; // always plot against time
              }).slice(1),
              y: $scope.csvdata.map(function(currentValue, index){
                return parseFloat(currentValue[column]);
              }).slice(1),
              mode: 'lines+markers',
              yaxis: 'y2',
              type: 'scatter',
              name: $scope.csv_header_row[column].name
            };
            data.push(trace);
          }
        }

        var layout = {height: 600};


        if($scope.primary_axis_title){
          layout.yaxis = {title: $scope.primary_axis_title};
          layout.title = $scope.primary_axis_title;
        }

        if($scope.secondary_axis_title) {
          layout.yaxis2 = {
            title: $scope.secondary_axis_title,
            overlaying: 'y',
            side: 'right'
          };

          if(layout.title){
            layout.title += " and " + $scope.secondary_axis_title;
          }
        }

        if(layout.title){
          layout.title += " vs. Time";
        }

        Plotly.newPlot('scatterplot', data, layout);

        $scope.zoom_start_date = $scope.csvdata[1][0].moment;
        $scope.zoom_end_date = $scope.csvdata[$scope.csvdata.length - 1][0].moment;

        $('#'+"scatterplot").bind('plotly_relayout',function(event, eventdata){
            if(eventdata["xaxis.autorange"]){
                $scope.zoom_start_date = $scope.csvdata[1][0].moment;
                $scope.zoom_end_date = $scope.csvdata[$scope.csvdata.length - 1][0].moment;

            }
            else if(eventdata["xaxis.range[0]"] && eventdata["xaxis.range[1]"]){
                $scope.zoom_start_date = moment(eventdata["xaxis.range[0]"]);
                $scope.zoom_end_date = moment(eventdata["xaxis.range[1]"]);

            }

            $scope.$apply();
        });

    }
}]);