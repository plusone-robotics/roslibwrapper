import React, { Component } from "react";
import * as ROSLIB from "roslib";
import * as actionTypes from "../../store/actions";
import { connect } from "react-redux";

export const Roslib = React.createContext();

// Roslibwrapper

class RoslibWrapper extends Component {
  callService = (service, message = {}, callback = null) => {
    this.props.addAlert({
      variant: "info",
      message: "Calling service: " + service
    });
    this.state.serviceRefs[service].callService(
      new ROSLIB.ServiceRequest(message),
      result => {
        this.props.addAlert({
          variant: "success",
          message: "Service successfully called"
        });
        if (callback) {
          callback(result);
        }
      },
      error => {
        this.props.addAlert({
          variant: "error",
          message: error
        });
      }
    );
  };

  callAction = (action, data = {}, callback = null) => {
    this.props.addAlert({
      variant: "info",
      message: "Calling action: " + action
    });

    const goal = new ROSLIB.Goal({
      actionClient: this.state.actionRefs[action],
      goalMessage: data
    });

    goal.on("feedback", feedback => {
      // here we update some meta data to show the feedback
      this.props.updateActionMeta({
        name: action,
        type: "feedback",
        data: feedback
      });
    });

    goal.on("result", result => {
      // here we update some meta data to show the result
      this.props.updateActionMeta({
        name: action,
        type: "result",
        data: result
      });

      // This needs to be changed as it could be a failed result
      if (callback) {
        callback(result, this.props.addAlert);
      }
      // this.props.addAlert({
      //   variant: "success",
      //   message: "Action: " + action + ", successfully reached goal."
      // });
    });

    goal.send();
  };

  Connect = () => {
    this.props.addAlert({
      variant: "info",
      message: "Connecting to websocket server"
    });

    // Adding a quick ugly check to see if we need a port
    let port = "";
    if (this.props.port.length > 0) {
      port = ":" + this.props.port;
    }
    this.api = new ROSLIB.Ros({
      url: "ws://" + this.props.host + port
    });

    this.setupRosCalls();
  };

  reConnect = connection => {
    // If we already have an active connection, we should clean that up first
    if (this.hasOwnProperty("api")) {
      this.props.addAlert({
        variant: "info",
        message: "Reconnecting to websocket server"
      });

      // First we unsubscribe to each topic
      for (let topic in this.props.topics) {
        this.state.topicRefs[topic].unsubscribe();
      }

      // TODO: Need to handle corner cases for Actions

      this.api.close();

      // if we're calling this directly we're passing in a connection
      let reconPort = "";
      if (connection.port.length > 0) {
        reconPort = ":" + connection.port;
      }
      this.api = new ROSLIB.Ros({
        url: "ws://" + connection.host + reconPort
      });

      this.setState({
        host: connection.host,
        port: connection.port
      });
    }

    this.setupRosCalls();
  };

  setupRosCalls = () => {
    this.api.on("connection", () => {
      this.props.connected(true);
      this.props.addAlert({
        variant: "success",
        message: "Connected to websocket server"
      });
    });

    this.api.on("error", error => {
      this.props.connected(false);
      this.props.addAlert({
        variant: "error",
        message: "Unable to connect to websocket server"
      });
    });

    this.api.on("close", () => {
      this.props.connected(false);
      this.props.addAlert({
        variant: "warning",
        message: "Connection to websocket server closed"
      });
    });

    let topicRefs = {};
    for (let topic in this.props.topics) {
      if (this.props.topics.hasOwnProperty(topic)) {
        topicRefs[topic] = new ROSLIB.Topic({
          ros: this.api,
          name: this.props.topics[topic].name,
          messageType: this.props.topics[topic].messageType
        });
        topicRefs[topic].subscribe(message => {
          this.props.topics[topic].callback(message);
        });
      }
    }

    this.setState({
      topicRefs: {
        ...topicRefs
      }
    });

    let serviceRefs = {};
    for (let service in this.props.services) {
      if (this.props.services.hasOwnProperty(service)) {
        serviceRefs[service] = new ROSLIB.Service({
          ros: this.api,
          name: this.props.services[service].name,
          serviceType: this.props.services[service].serviceType
        });
      }
    }

    this.setState({
      serviceRefs: {
        ...serviceRefs
      }
    });

    let actionRefs = {};
    for (let action in this.props.actions) {
      if (this.props.actions.hasOwnProperty(action)) {
        actionRefs[action] = new ROSLIB.ActionClient({
          ros: this.api,
          serverName: this.props.actions[action].serverName,
          actionName: this.props.actions[action].actionName
        });
      }
    }

    this.setState({
      actionRefs: {
        ...actionRefs
      }
    });
  };

  state = {
    host: window.location.hostname,
    port: "9090",
    topicRefs: {},
    serviceRefs: {},
    actionRefs: {},
    callService: this.callService,
    callAction: this.callAction,
    reConnect: this.reConnect
  };

  componentDidMount() {
    this.Connect();
  }

  componentWillUnmount() {
    if (this.api) {
      this.api.close();
    }
  }

  render() {
    return (
      <Roslib.Provider value={this.state}>
        {this.props.children}
      </Roslib.Provider>
    );
  }
}

const mapStateToProps = state => {
  return {
    topics: state.topics,
    services: state.services,
    actions: state.actions,
    host: state.host,
    port: state.port
  };
};

const mapDispatchToProps = dispatch => {
  return {
    connected: connected =>
      dispatch({ type: actionTypes.WS_CONNECTED, connected: connected }),
    updateActionMeta: data =>
      dispatch({ type: actionTypes.UPDATE_ACTION_META, data: data })
  };
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(RoslibWrapper);
